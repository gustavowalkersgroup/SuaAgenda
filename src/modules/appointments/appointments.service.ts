import { addMinutes, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { query, withTransaction } from '../../db/client'
import { NotFoundError, AppError, ConflictError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'
import { getServicesWithProfessionals } from '../services/services.service'
import { findAvailableSchedules, revalidateAssignments, SlotAssignment } from '../../engine/scheduling.engine'
import { AppointmentStatus } from '../../shared/types'
import { scheduleExpirationJob } from '../../queues/appointment.queue'
import { logger } from '../../config/logger'
import { sendMessage } from '../whatsapp/whatsapp.service'

const MAX_SERVICES_PER_APPOINTMENT = 3

interface ServiceRequest {
  serviceId: string
  professionalId?: string  // opcional: cliente pode deixar o sistema escolher
}

export interface CreateAppointmentDTO {
  contactId: string
  conversationId?: string
  services: ServiceRequest[]
  selectedAssignments: SlotAssignment[]
  notes?: string
}

export async function searchAvailability(params: {
  workspaceId: string
  serviceIds: string[]
  from?: string
  to?: string
}) {
  const { workspaceId, serviceIds } = params

  if (serviceIds.length > MAX_SERVICES_PER_APPOINTMENT) {
    throw new AppError(`Máximo ${MAX_SERVICES_PER_APPOINTMENT} serviços por agendamento`, 400)
  }

  // Busca configurações do workspace
  const wsResult = await query<{
    parallel_scheduling: boolean
    scheduling_window_days: number
  }>(
    'SELECT parallel_scheduling, scheduling_window_days FROM workspaces WHERE id = $1',
    [workspaceId]
  )
  const ws = wsResult.rows[0]

  const from = params.from ? new Date(params.from) : new Date()
  const to = params.to
    ? new Date(params.to)
    : addMinutes(from, ws.scheduling_window_days * 24 * 60)

  const services = await getServicesWithProfessionals(workspaceId, serviceIds)

  const suggestions = await findAvailableSchedules({
    workspaceId,
    services: services.map((s) => ({
      serviceId: s.id,
      name: s.name,
      durationMinutes: s.duration_minutes,
      professionalIds: s.professional_ids,
    })),
    from,
    to,
    parallelEnabled: ws.parallel_scheduling,
  })

  return { suggestions, services }
}

export async function createAppointment(workspaceId: string, dto: CreateAppointmentDTO) {
  if (dto.selectedAssignments.length > MAX_SERVICES_PER_APPOINTMENT) {
    throw new AppError(`Máximo ${MAX_SERVICES_PER_APPOINTMENT} serviços`, 400)
  }

  // Busca configurações do workspace
  const wsResult = await query<{ slot_lock_minutes: number }>(
    'SELECT slot_lock_minutes FROM workspaces WHERE id = $1',
    [workspaceId]
  )
  const { slot_lock_minutes } = wsResult.rows[0]

  return withTransaction(async (client) => {
    // Revalida disponibilidade (anti race-condition)
    const stillFree = await revalidateAssignments(dto.selectedAssignments)
    if (!stillFree) throw new ConflictError('Um ou mais horários foram ocupados. Por favor, escolha novamente.')

    // Busca serviços para calcular valores
    const serviceIds = dto.selectedAssignments.map((a) => a.serviceId)
    const servicesResult = await client.query<{
      id: string
      price: number
      deposit_percent: number
    }>(
      `SELECT id, price, deposit_percent FROM services WHERE id = ANY($1::uuid[])`,
      [serviceIds]
    )
    const servicesMap = Object.fromEntries(servicesResult.rows.map((s) => [s.id, s]))

    // Calcula totais
    let totalPrice = 0
    let depositAmount = 0
    for (const a of dto.selectedAssignments) {
      const svc = servicesMap[a.serviceId]
      totalPrice += Number(svc.price)
      depositAmount += Number(svc.price) * (Number(svc.deposit_percent) / 100)
    }

    const startsAt = dto.selectedAssignments.reduce(
      (min, a) => a.startAt < min ? a.startAt : min,
      dto.selectedAssignments[0].startAt
    )
    const endsAt = dto.selectedAssignments.reduce(
      (max, a) => a.endAt > max ? a.endAt : max,
      dto.selectedAssignments[0].endAt
    )
    const expiresAt = addMinutes(new Date(), slot_lock_minutes)

    const apptResult = await client.query<{ id: string }>(
      `INSERT INTO appointments
         (workspace_id, contact_id, conversation_id, status, starts_at, ends_at,
          total_price, deposit_amount, notes, expires_at)
       VALUES ($1,$2,$3,'PRE_RESERVADO',$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        workspaceId, dto.contactId, dto.conversationId || null,
        startsAt.toISOString(), endsAt.toISOString(),
        totalPrice.toFixed(2), depositAmount.toFixed(2),
        dto.notes || null, expiresAt.toISOString(),
      ]
    )
    const appointmentId = apptResult.rows[0].id

    // Insere os serviços do agendamento
    for (let i = 0; i < dto.selectedAssignments.length; i++) {
      const a = dto.selectedAssignments[i]
      const svc = servicesMap[a.serviceId]
      await client.query(
        `INSERT INTO appointment_services
           (appointment_id, service_id, professional_id, starts_at, ends_at, price, deposit_percent, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          appointmentId, a.serviceId, a.professionalId,
          a.startAt.toISOString(), a.endAt.toISOString(),
          svc.price, svc.deposit_percent, i,
        ]
      )
    }

    // Atualiza status do contato
    await client.query(
      `UPDATE contacts SET status = 'agendado' WHERE id = $1 AND workspace_id = $2`,
      [dto.contactId, workspaceId]
    )

    // Agenda job de expiração
    await scheduleExpirationJob(appointmentId, expiresAt)

    return getAppointment(workspaceId, appointmentId)
  })
}

export async function getAppointment(workspaceId: string, appointmentId: string) {
  const result = await query(
    `SELECT
       a.id, a.status, a.starts_at, a.ends_at, a.total_price, a.deposit_amount,
       a.notes, a.expires_at, a.confirmed_at, a.cancelled_at, a.cancel_reason,
       a.created_at,
       c.id as contact_id, c.name as contact_name, c.phone as contact_phone,
       COALESCE(json_agg(
         json_build_object(
           'serviceId', aps.service_id,
           'serviceName', s.name,
           'professionalId', aps.professional_id,
           'professionalName', p.name,
           'startsAt', aps.starts_at,
           'endsAt', aps.ends_at,
           'price', aps.price
         ) ORDER BY aps.sort_order
       ), '[]') as services
     FROM appointments a
     JOIN contacts c ON c.id = a.contact_id
     LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
     LEFT JOIN services s ON s.id = aps.service_id
     LEFT JOIN professionals p ON p.id = aps.professional_id
     WHERE a.id = $1 AND a.workspace_id = $2
     GROUP BY a.id, c.id`,
    [appointmentId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Agendamento')
  return result.rows[0]
}

export async function listAppointments(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)
  const conditions: string[] = ['a.workspace_id = $1']
  const values: unknown[] = [workspaceId]
  let i = 2

  if (queryParams.status) { conditions.push(`a.status = $${i++}`); values.push(queryParams.status) }
  if (queryParams.contactId) { conditions.push(`a.contact_id = $${i++}`); values.push(queryParams.contactId) }
  if (queryParams.professionalId) {
    conditions.push(`EXISTS (SELECT 1 FROM appointment_services aps2 WHERE aps2.appointment_id = a.id AND aps2.professional_id = $${i++})`)
    values.push(queryParams.professionalId)
  }
  if (queryParams.from) { conditions.push(`a.starts_at >= $${i++}`); values.push(queryParams.from) }
  if (queryParams.to) { conditions.push(`a.starts_at <= $${i++}`); values.push(queryParams.to) }

  const where = conditions.join(' AND ')

  const [rows, count] = await Promise.all([
    query(
      `SELECT a.id, a.status, a.starts_at, a.ends_at, a.total_price, a.deposit_amount,
              c.name as contact_name, c.phone as contact_phone
       FROM appointments a
       JOIN contacts c ON c.id = a.contact_id
       WHERE ${where}
       ORDER BY a.starts_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(`SELECT COUNT(*) FROM appointments a WHERE ${where}`, values),
  ])

  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function confirmAppointment(workspaceId: string, appointmentId: string) {
  const appt = await getAppointment(workspaceId, appointmentId)

  if (appt.status !== 'PRE_RESERVADO') {
    throw new AppError('Apenas agendamentos PRE_RESERVADO podem ser confirmados', 400)
  }
  if (new Date(appt.expires_at) < new Date()) {
    throw new AppError('Pré-reserva expirada', 400)
  }

  // Revalida disponibilidade antes de confirmar
  const assignments = (appt.services as Array<{
    serviceId: string; professionalId: string; startsAt: string; endsAt: string
  }>).map((s) => ({
    serviceId: s.serviceId,
    serviceName: '',
    professionalId: s.professionalId,
    startAt: new Date(s.startsAt),
    endAt: new Date(s.endsAt),
  }))

  const stillFree = await revalidateAssignments(assignments, appointmentId)
  if (!stillFree) throw new ConflictError('Horário ocupado por outro agendamento')

  await query(
    `UPDATE appointments
     SET status = 'CONFIRMADO', confirmed_at = NOW(), expires_at = NULL
     WHERE id = $1 AND workspace_id = $2`,
    [appointmentId, workspaceId]
  )

  const confirmed = await getAppointment(workspaceId, appointmentId)

  // Notifica profissional(is) via WhatsApp em background (não bloqueia a resposta)
  notifyProfessionalsAfterConfirmation(workspaceId, confirmed).catch((err) =>
    logger.error('Professional notification failed', { error: (err as Error).message })
  )

  return confirmed
}

async function notifyProfessionalsAfterConfirmation(
  workspaceId: string,
  appt: Record<string, unknown>
): Promise<void> {
  // Busca a primeira conversa ativa do workspace para enviar a mensagem
  const numResult = await query<{ id: string; instance_name: string }>(
    `SELECT id, instance_name FROM whatsapp_numbers
     WHERE workspace_id = $1 AND is_connected = true
     ORDER BY created_at LIMIT 1`,
    [workspaceId]
  )
  if (!numResult.rowCount) return // Nenhum número conectado

  // Busca profissionais únicos do agendamento com telefone cadastrado
  const services = appt.services as Array<{
    professionalId: string
    professionalName: string
    serviceName: string
    startsAt: string
    price: number
  }>

  const professionalIds = [...new Set(services.map(s => s.professionalId).filter(Boolean))]
  if (!professionalIds.length) return

  const profResult = await query<{ id: string; phone: string; name: string }>(
    `SELECT id, phone, name FROM professionals
     WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND phone IS NOT NULL AND phone != ''`,
    [workspaceId, professionalIds]
  )
  if (!profResult.rowCount) return

  const startsAt = new Date(appt.starts_at as string)
  const dateStr = format(startsAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const serviceNames = [...new Set(services.map(s => s.serviceName))].join(', ')
  const totalPrice = Number(appt.total_price)

  const numberId = numResult.rows[0].id

  for (const prof of profResult.rows) {
    // Busca ou cria conversa com o profissional
    const convResult = await query<{ id: string }>(
      `SELECT cv.id FROM conversations cv
       JOIN contacts c ON c.id = cv.contact_id
       WHERE cv.workspace_id = $1 AND c.phone = $2 AND cv.number_id = $3
       ORDER BY cv.created_at DESC LIMIT 1`,
      [workspaceId, prof.phone.replace(/\D/g, ''), numberId]
    )

    if (!convResult.rowCount) continue // Profissional não tem conversa ativa, pula

    const msg =
      `📅 *Novo agendamento confirmado!*\n\n` +
      `👤 Cliente: ${appt.contact_name}\n` +
      `✂️ Serviço: ${serviceNames}\n` +
      `🕐 Data/hora: ${dateStr}\n` +
      `💰 Valor: R$ ${totalPrice.toFixed(2).replace('.', ',')}\n\n` +
      `Por favor, anote na sua agenda. 😊`

    await sendMessage(workspaceId, convResult.rows[0].id, msg).catch(() => {/* silent */})
  }
}

export async function cancelAppointment(
  workspaceId: string,
  appointmentId: string,
  reason?: string
) {
  const result = await query(
    `UPDATE appointments
     SET status = 'CANCELADO', cancelled_at = NOW(), cancel_reason = $3
     WHERE id = $1 AND workspace_id = $2
       AND status IN ('PRE_RESERVADO', 'CONFIRMADO')`,
    [appointmentId, workspaceId, reason || null]
  )
  if (!result.rowCount) throw new AppError('Agendamento não pode ser cancelado', 400)

  // Notifica waitlist em background (não bloqueia o cancelamento)
  notifyWaitlistAfterCancellation(workspaceId, appointmentId)
}

export async function expireAppointment(appointmentId: string) {
  const result = await query<{ workspace_id: string }>(
    `UPDATE appointments SET status = 'EXPIRADO'
     WHERE id = $1 AND status = 'PRE_RESERVADO' AND expires_at < NOW()
     RETURNING workspace_id`,
    [appointmentId]
  )

  if (result.rowCount) {
    notifyWaitlistAfterCancellation(result.rows[0].workspace_id, appointmentId)
  }
}

function notifyWaitlistAfterCancellation(workspaceId: string, appointmentId: string): void {
  import('../waitlist/waitlist.service')
    .then(({ notifyWaitlist }) => notifyWaitlist(workspaceId, appointmentId))
    .catch((err) => logger.error('Waitlist notification failed', { error: (err as Error).message }))
}

export async function reschedule(
  workspaceId: string,
  appointmentId: string,
  dto: Omit<CreateAppointmentDTO, 'contactId' | 'conversationId'>
) {
  const existing = await getAppointment(workspaceId, appointmentId)

  await cancelAppointment(workspaceId, appointmentId, 'Reagendamento')

  return createAppointment(workspaceId, {
    contactId: existing.contact_id,
    conversationId: existing.conversation_id,
    services: dto.services,
    selectedAssignments: dto.selectedAssignments,
    notes: dto.notes,
  })
}
