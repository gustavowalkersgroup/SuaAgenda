/**
 * Waitlist Service — Encaixe
 *
 * Fluxo:
 * 1. Cliente solicita encaixe → entra na waitlist
 * 2. Quando um agendamento é CANCELADO/EXPIRADO →
 *    notifyWaitlist() busca candidatos compatíveis e envia oferta
 * 3. Primeiro a aceitar (responder 'sim' via IA) fica com a vaga
 *    Os demais são notificados que a vaga já foi preenchida
 */

import { addHours } from 'date-fns'
import { query, withTransaction } from '../../db/client'
import { NotFoundError, ConflictError, AppError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'
import { sendMessage } from '../whatsapp/whatsapp.service'
import { findOrCreateConversation } from '../conversations/conversations.service'
import { logger } from '../../config/logger'
import { redis } from '../../db/redis'

const OFFER_TTL_SECONDS = 60 * 30  // oferta expira em 30 min

interface JoinWaitlistDTO {
  serviceId: string
  professionalId?: string
  preferredFrom?: string
  preferredTo?: string
}

// ==========================================================================
// Inscrição
// ==========================================================================

export async function joinWaitlist(
  workspaceId: string,
  contactId: string,
  dto: JoinWaitlistDTO
): Promise<{ id: string }> {
  // Verifica se já está na fila para este serviço
  const existing = await query<{ id: string }>(
    `SELECT id FROM waitlist
     WHERE workspace_id = $1 AND contact_id = $2 AND service_id = $3 AND is_active = true`,
    [workspaceId, contactId, dto.serviceId]
  )
  if (existing.rowCount) throw new ConflictError('Já existe uma solicitação de encaixe ativa para este serviço')

  const result = await query<{ id: string }>(
    `INSERT INTO waitlist
       (workspace_id, contact_id, service_id, professional_id, preferred_from, preferred_to)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      workspaceId, contactId, dto.serviceId,
      dto.professionalId || null,
      dto.preferredFrom || null,
      dto.preferredTo || null,
    ]
  )

  logger.info('Contact joined waitlist', { workspaceId, contactId, serviceId: dto.serviceId })
  return result.rows[0]
}

export async function leaveWaitlist(workspaceId: string, waitlistId: string): Promise<void> {
  await query(
    `UPDATE waitlist SET is_active = false WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, waitlistId]
  )
}

export async function listWaitlist(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)
  const [rows, count] = await Promise.all([
    query(
      `SELECT wl.id, wl.is_active, wl.preferred_from, wl.preferred_to,
              wl.notified_at, wl.accepted_at, wl.created_at,
              c.name as contact_name, c.phone as contact_phone,
              s.name as service_name,
              p.name as professional_name
       FROM waitlist wl
       JOIN contacts c ON c.id = wl.contact_id
       JOIN services s ON s.id = wl.service_id
       LEFT JOIN professionals p ON p.id = wl.professional_id
       WHERE wl.workspace_id = $1
       ORDER BY wl.created_at ASC
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    ),
    query<{ count: string }>('SELECT COUNT(*) FROM waitlist WHERE workspace_id = $1', [workspaceId]),
  ])
  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

// ==========================================================================
// Monitoramento — chamado quando agendamento é cancelado/expirado
// ==========================================================================

export async function notifyWaitlist(
  workspaceId: string,
  cancelledAppointmentId: string
): Promise<void> {
  // Busca os serviços do agendamento cancelado
  const servicesResult = await query<{
    service_id: string
    professional_id: string
    starts_at: string
    ends_at: string
  }>(
    `SELECT service_id, professional_id, starts_at, ends_at
     FROM appointment_services
     WHERE appointment_id = $1`,
    [cancelledAppointmentId]
  )

  if (!servicesResult.rowCount) return

  for (const slot of servicesResult.rows) {
    await notifyWaitlistForSlot(workspaceId, slot)
  }
}

async function notifyWaitlistForSlot(
  workspaceId: string,
  slot: { service_id: string; professional_id: string; starts_at: string; ends_at: string }
): Promise<void> {
  // Busca candidatos ativos para este serviço
  const candidates = await query<{
    id: string
    contact_id: string
    professional_id: string | null
    preferred_from: string | null
    preferred_to: string | null
  }>(
    `SELECT wl.id, wl.contact_id, wl.professional_id, wl.preferred_from, wl.preferred_to
     FROM waitlist wl
     WHERE wl.workspace_id = $1
       AND wl.service_id = $2
       AND wl.is_active = true
       AND wl.accepted_at IS NULL
       AND (wl.professional_id IS NULL OR wl.professional_id = $3)
       AND (wl.preferred_from IS NULL OR wl.preferred_from <= $4)
       AND (wl.preferred_to   IS NULL OR wl.preferred_to   >= $5)
     ORDER BY wl.created_at ASC`,
    [workspaceId, slot.service_id, slot.professional_id, slot.starts_at, slot.ends_at]
  )

  if (!candidates.rowCount) return

  logger.info('Notifying waitlist', {
    workspaceId,
    slotStart: slot.starts_at,
    candidates: candidates.rowCount,
  })

  // Cria uma "oferta" no Redis para controle de quem aceita primeiro
  const offerKey = `waitlist:offer:${workspaceId}:${slot.service_id}:${slot.starts_at}`
  const offerData = JSON.stringify({
    serviceId: slot.service_id,
    professionalId: slot.professional_id,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    candidates: candidates.rows.map((c) => c.id),
  })
  await redis.set(offerKey, offerData, { EX: OFFER_TTL_SECONDS })

  // Envia mensagem para cada candidato
  for (const candidate of candidates.rows) {
    await sendWaitlistOffer(workspaceId, candidate.contact_id, slot, offerKey)

    // Marca como notificado
    await query(
      `UPDATE waitlist SET notified_at = NOW() WHERE id = $1`,
      [candidate.id]
    )
  }
}

async function sendWaitlistOffer(
  workspaceId: string,
  contactId: string,
  slot: { service_id: string; starts_at: string; ends_at: string },
  offerKey: string
): Promise<void> {
  try {
    // Busca informações do serviço para a mensagem
    const serviceResult = await query<{ name: string }>(
      'SELECT name FROM services WHERE id = $1',
      [slot.service_id]
    )
    if (!serviceResult.rowCount) return

    const serviceName = serviceResult.rows[0].name
    const startsAt = new Date(slot.starts_at)
    const dateStr = startsAt.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    const timeStr = startsAt.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    })

    const message =
      `🎉 *Vaga disponível!*\n\n` +
      `Um horário abrindo para *${serviceName}*:\n` +
      `📅 ${dateStr} às ${timeStr}\n\n` +
      `Responda *SIM* para reservar agora!\n` +
      `⚠️ Oferta válida por 30 minutos.`

    // Busca número ativo do workspace
    const numberResult = await query<{ id: string }>(
      `SELECT id FROM whatsapp_numbers
       WHERE workspace_id = $1 AND purpose = 'atendimento' AND is_connected = true
       LIMIT 1`,
      [workspaceId]
    )
    if (!numberResult.rowCount) return

    const conversationId = await findOrCreateConversation(
      workspaceId,
      contactId,
      numberResult.rows[0].id
    )

    // Armazena a oferta na conversa para o agente processar a resposta
    await redis.set(
      `waitlist:pending:${conversationId}`,
      offerKey,
      { EX: OFFER_TTL_SECONDS }
    )

    await sendMessage(workspaceId, conversationId, message)
  } catch (err) {
    logger.error('Failed to send waitlist offer', {
      contactId,
      error: (err as Error).message,
    })
  }
}

// ==========================================================================
// Aceitar oferta — chamado quando cliente responde "SIM"
// ==========================================================================

export async function acceptWaitlistOffer(
  workspaceId: string,
  conversationId: string,
  contactId: string
): Promise<boolean> {
  const offerKey = await redis.get(`waitlist:pending:${conversationId}`)
  if (!offerKey) return false

  const offerData = await redis.get(offerKey)
  if (!offerData) {
    // Oferta expirou
    await redis.del(`waitlist:pending:${conversationId}`)
    return false
  }

  const offer = JSON.parse(offerData) as {
    serviceId: string
    professionalId: string
    startsAt: string
    endsAt: string
    candidates: string[]
  }

  // Tenta adquirir o lock da oferta (apenas um cliente pode aceitar)
  const lockKey = `${offerKey}:lock`
  const acquired = await redis.set(lockKey, contactId, { NX: true, EX: 60 })

  if (!acquired) {
    // Outro cliente chegou primeiro
    await sendMessage(
      workspaceId,
      conversationId,
      'Que pena! Esta vaga já foi preenchida por outro cliente. Você continua na lista de espera para próximas vagas! 😊'
    )
    await redis.del(`waitlist:pending:${conversationId}`)
    return false
  }

  // Remove a oferta para evitar que outros aceitem
  await redis.del(offerKey)
  await redis.del(`waitlist:pending:${conversationId}`)

  // Marca como aceito na waitlist
  const waitlistResult = await query<{ id: string }>(
    `UPDATE waitlist SET accepted_at = NOW(), is_active = false
     WHERE workspace_id = $1 AND contact_id = $2 AND service_id = $3 AND is_active = true
     RETURNING id`,
    [workspaceId, contactId, offer.serviceId]
  )

  if (!waitlistResult.rowCount) return false

  // Notifica os demais candidatos que a vaga foi preenchida
  for (const candidateWaitlistId of offer.candidates) {
    const candidateResult = await query<{ contact_id: string }>(
      'SELECT contact_id FROM waitlist WHERE id = $1',
      [candidateWaitlistId]
    )
    if (!candidateResult.rowCount) continue
    const otherContactId = candidateResult.rows[0].contact_id
    if (otherContactId === contactId) continue

    try {
      const convResult = await query<{ id: string }>(
        `SELECT id FROM conversations
         WHERE workspace_id = $1 AND contact_id = $2 AND status != 'fechada'
         LIMIT 1`,
        [workspaceId, otherContactId]
      )
      if (convResult.rowCount) {
        await sendMessage(
          workspaceId,
          convResult.rows[0].id,
          'A vaga foi preenchida por outro cliente. Não se preocupe, avisaremos na próxima abertura! 🙂'
        )
      }
    } catch { /* não bloqueia o fluxo principal */ }
  }

  logger.info('Waitlist offer accepted', { workspaceId, contactId, serviceId: offer.serviceId })
  return true
}

// Verifica se uma mensagem "sim" é resposta a uma oferta de encaixe
export async function isWaitlistResponse(conversationId: string, text: string): Promise<boolean> {
  const offerKey = await redis.get(`waitlist:pending:${conversationId}`)
  if (!offerKey) return false
  const normalized = text.toLowerCase().trim()
  return ['sim', 's', 'yes', 'quero', 'aceito', '👍'].some((w) => normalized.includes(w))
}
