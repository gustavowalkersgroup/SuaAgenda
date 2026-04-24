/**
 * Notifications Service
 *
 * - Lembretes de agendamento (X horas antes, entre 7h–19h)
 * - Confirmação pós-pagamento
 * - No-show automático (grace period configurável)
 */

import { toZonedTime } from 'date-fns-tz'
import { query } from '../../db/client'
import { sendMessage } from '../whatsapp/whatsapp.service'
import { findOrCreateConversation } from '../conversations/conversations.service'
import { logger } from '../../config/logger'

const TIMEZONE = 'America/Sao_Paulo'

interface NotificationConfig {
  reminderEnabled: boolean
  reminderHoursBefore: number[]
  reminderSendFrom: string   // 'HH:MM'
  reminderSendUntil: string
  paymentConfirmEnabled: boolean
  paymentConfirmMessage: string
  noshowEnabled: boolean
  noshowGraceMinutes: number
}

// ==========================================================================
// Config
// ==========================================================================

export async function getNotificationConfig(workspaceId: string): Promise<NotificationConfig> {
  const result = await query<{
    reminder_enabled: boolean
    reminder_hours_before: number[]
    reminder_send_from: string
    reminder_send_until: string
    payment_confirm_enabled: boolean
    payment_confirm_message: string
    noshow_enabled: boolean
    noshow_grace_minutes: number
  }>(
    `SELECT * FROM notification_configs WHERE workspace_id = $1`,
    [workspaceId]
  )

  if (!result.rowCount) return await createDefaultConfig(workspaceId)

  const r = result.rows[0]
  return {
    reminderEnabled: r.reminder_enabled,
    reminderHoursBefore: r.reminder_hours_before,
    reminderSendFrom: r.reminder_send_from,
    reminderSendUntil: r.reminder_send_until,
    paymentConfirmEnabled: r.payment_confirm_enabled,
    paymentConfirmMessage: r.payment_confirm_message,
    noshowEnabled: r.noshow_enabled,
    noshowGraceMinutes: r.noshow_grace_minutes,
  }
}

async function createDefaultConfig(workspaceId: string): Promise<NotificationConfig> {
  await query(
    `INSERT INTO notification_configs (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [workspaceId]
  )
  return getNotificationConfig(workspaceId)
}

export async function updateNotificationConfig(
  workspaceId: string,
  dto: Partial<NotificationConfig>
): Promise<NotificationConfig> {
  await getNotificationConfig(workspaceId) // garante que existe

  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (dto.reminderEnabled !== undefined)       { fields.push(`reminder_enabled = $${i++}`);       values.push(dto.reminderEnabled) }
  if (dto.reminderHoursBefore !== undefined)   { fields.push(`reminder_hours_before = $${i++}`);  values.push(dto.reminderHoursBefore) }
  if (dto.reminderSendFrom !== undefined)      { fields.push(`reminder_send_from = $${i++}`);     values.push(dto.reminderSendFrom) }
  if (dto.reminderSendUntil !== undefined)     { fields.push(`reminder_send_until = $${i++}`);    values.push(dto.reminderSendUntil) }
  if (dto.paymentConfirmEnabled !== undefined) { fields.push(`payment_confirm_enabled = $${i++}`);values.push(dto.paymentConfirmEnabled) }
  if (dto.paymentConfirmMessage !== undefined) { fields.push(`payment_confirm_message = $${i++}`);values.push(dto.paymentConfirmMessage) }
  if (dto.noshowEnabled !== undefined)         { fields.push(`noshow_enabled = $${i++}`);         values.push(dto.noshowEnabled) }
  if (dto.noshowGraceMinutes !== undefined)    { fields.push(`noshow_grace_minutes = $${i++}`);   values.push(dto.noshowGraceMinutes) }

  if (fields.length) {
    values.push(workspaceId)
    await query(`UPDATE notification_configs SET ${fields.join(', ')} WHERE workspace_id = $${i}`, values)
  }

  return getNotificationConfig(workspaceId)
}

// ==========================================================================
// Lembretes de agendamento — chamado pelo cron a cada 15 min
// ==========================================================================

export async function processReminders(): Promise<void> {
  // Busca todos os workspaces com lembretes ativos
  const workspaces = await query<{ workspace_id: string }>(
    `SELECT workspace_id FROM notification_configs WHERE reminder_enabled = true`
  )

  for (const { workspace_id } of workspaces.rows) {
    try {
      await processWorkspaceReminders(workspace_id)
    } catch (err) {
      logger.error('Reminder processing failed', { workspaceId: workspace_id, error: (err as Error).message })
    }
  }
}

async function processWorkspaceReminders(workspaceId: string): Promise<void> {
  const config = await getNotificationConfig(workspaceId)
  const now = new Date()
  const nowZoned = toZonedTime(now, TIMEZONE)

  // Verifica janela de envio
  if (!isWithinSendWindow(nowZoned, config.reminderSendFrom, config.reminderSendUntil)) return

  for (const hoursBefore of config.reminderHoursBefore) {
    const windowStart = new Date(now.getTime() + (hoursBefore * 60 - 15) * 60000)
    const windowEnd   = new Date(now.getTime() + (hoursBefore * 60 + 15) * 60000)

    // Agendamentos confirmados dentro da janela que ainda não receberam este lembrete
    const appointments = await query<{
      id: string
      starts_at: string
      contact_id: string
      contact_name: string
      contact_phone: string
      services_summary: string
    }>(
      `SELECT a.id, a.starts_at,
              c.id as contact_id, c.name as contact_name, c.phone as contact_phone,
              string_agg(s.name, ', ') as services_summary
       FROM appointments a
       JOIN contacts c ON c.id = a.contact_id
       JOIN appointment_services aps ON aps.appointment_id = a.id
       JOIN services s ON s.id = aps.service_id
       WHERE a.workspace_id = $1
         AND a.status = 'CONFIRMADO'
         AND a.starts_at BETWEEN $2 AND $3
         AND NOT EXISTS (
           SELECT 1 FROM appointment_reminders ar
           WHERE ar.appointment_id = a.id AND ar.hours_before = $4
         )
       GROUP BY a.id, c.id`,
      [workspaceId, windowStart.toISOString(), windowEnd.toISOString(), hoursBefore]
    )

    for (const appt of appointments.rows) {
      await sendReminderMessage(workspaceId, appt, hoursBefore)
    }
  }
}

async function sendReminderMessage(
  workspaceId: string,
  appt: { id: string; starts_at: string; contact_id: string; contact_name: string; contact_phone: string; services_summary: string },
  hoursBefore: number
): Promise<void> {
  const startsAt = new Date(appt.starts_at)
  const dateStr = startsAt.toLocaleDateString('pt-BR', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = startsAt.toLocaleTimeString('pt-BR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' })

  const hoursLabel = hoursBefore >= 24
    ? `${hoursBefore / 24} dia${hoursBefore / 24 > 1 ? 's' : ''}`
    : `${hoursBefore} hora${hoursBefore > 1 ? 's' : ''}`

  const firstName = (appt.contact_name || appt.contact_phone).split(' ')[0]
  const message =
    `⏰ *Lembrete de agendamento*\n\n` +
    `Olá, ${firstName}! Seu agendamento é em *${hoursLabel}*:\n\n` +
    `📋 ${appt.services_summary}\n` +
    `📅 ${dateStr} às ${timeStr}\n\n` +
    `Qualquer dúvida, é só falar! 😊`

  try {
    const numberResult = await query<{ id: string }>(
      `SELECT id FROM whatsapp_numbers
       WHERE workspace_id = $1 AND purpose = 'atendimento' AND is_connected = true LIMIT 1`,
      [workspaceId]
    )
    if (!numberResult.rowCount) return

    const conversationId = await findOrCreateConversation(workspaceId, appt.contact_id, numberResult.rows[0].id)
    await sendMessage(workspaceId, conversationId, message)

    await query(
      `INSERT INTO appointment_reminders (appointment_id, hours_before) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [appt.id, hoursBefore]
    )

    logger.info('Reminder sent', { appointmentId: appt.id, hoursBefore })
  } catch (err) {
    logger.error('Failed to send reminder', { appointmentId: appt.id, error: (err as Error).message })
  }
}

// ==========================================================================
// Confirmação pós-pagamento
// ==========================================================================

export async function sendPaymentConfirmation(workspaceId: string, appointmentId: string): Promise<void> {
  const config = await getNotificationConfig(workspaceId)
  if (!config.paymentConfirmEnabled) return

  const apptResult = await query<{
    starts_at: string
    contact_id: string
    contact_name: string
    services_summary: string
  }>(
    `SELECT a.starts_at, c.id as contact_id, c.name as contact_name,
            string_agg(s.name, ', ') as services_summary
     FROM appointments a
     JOIN contacts c ON c.id = a.contact_id
     JOIN appointment_services aps ON aps.appointment_id = a.id
     JOIN services s ON s.id = aps.service_id
     WHERE a.id = $1 AND a.workspace_id = $2
     GROUP BY a.id, c.id`,
    [appointmentId, workspaceId]
  )

  if (!apptResult.rowCount) return

  const appt = apptResult.rows[0]
  const startsAt = new Date(appt.starts_at)
  const dateStr = startsAt.toLocaleDateString('pt-BR', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = startsAt.toLocaleTimeString('pt-BR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' })

  const message = config.paymentConfirmMessage
    .replace(/\{\{data\}\}/gi, dateStr)
    .replace(/\{\{hora\}\}/gi, timeStr)
    .replace(/\{\{servicos\}\}/gi, appt.services_summary)
    .replace(/\{\{nome\}\}/gi, (appt.contact_name || '').split(' ')[0])

  try {
    const numberResult = await query<{ id: string }>(
      `SELECT id FROM whatsapp_numbers
       WHERE workspace_id = $1 AND purpose = 'atendimento' AND is_connected = true LIMIT 1`,
      [workspaceId]
    )
    if (!numberResult.rowCount) return

    const conversationId = await findOrCreateConversation(workspaceId, appt.contact_id, numberResult.rows[0].id)
    await sendMessage(workspaceId, conversationId, message)

    logger.info('Payment confirmation sent', { workspaceId, appointmentId })
  } catch (err) {
    logger.error('Failed to send payment confirmation', { appointmentId, error: (err as Error).message })
  }
}

// ==========================================================================
// No-show automático — cron a cada 5 min
// ==========================================================================

export async function processNoShows(): Promise<void> {
  const workspaces = await query<{ workspace_id: string; noshow_grace_minutes: number }>(
    `SELECT workspace_id, noshow_grace_minutes FROM notification_configs WHERE noshow_enabled = true`
  )

  for (const ws of workspaces.rows) {
    try {
      await markNoShows(ws.workspace_id, ws.noshow_grace_minutes)
    } catch (err) {
      logger.error('No-show processing failed', { workspaceId: ws.workspace_id, error: (err as Error).message })
    }
  }
}

async function markNoShows(workspaceId: string, graceMinutes: number): Promise<void> {
  const cutoff = new Date(Date.now() - graceMinutes * 60000)

  const result = await query<{ id: string; contact_id: string }>(
    `UPDATE appointments
     SET status = 'NO_SHOW'
     WHERE workspace_id = $1
       AND status = 'CONFIRMADO'
       AND ends_at < $2
     RETURNING id, contact_id`,
    [workspaceId, cutoff.toISOString()]
  )

  for (const appt of result.rows) {
    // Atualiza status do contato
    await query(
      `UPDATE contacts SET status = 'concluido' WHERE id = $1 AND workspace_id = $2`,
      [appt.contact_id, workspaceId]
    )
    logger.info('Appointment marked as NO_SHOW', { appointmentId: appt.id })
  }
}

// ==========================================================================
// Helpers
// ==========================================================================

function isWithinSendWindow(date: Date, fromTime: string, untilTime: string): boolean {
  const [fH, fM] = fromTime.replace(/:\d\d$/, '').split(':').map(Number)
  const [uH, uM] = untilTime.replace(/:\d\d$/, '').split(':').map(Number)
  const currentMinutes = date.getHours() * 60 + date.getMinutes()
  const fromMinutes = fH * 60 + fM
  const untilMinutes = uH * 60 + uM
  return currentMinutes >= fromMinutes && currentMinutes <= untilMinutes
}
