/**
 * Marketing Automations Service
 *
 * Triggers disponíveis:
 * - appointment_confirmed  → disparo X horas após confirmação
 * - appointment_completed  → disparo X horas após conclusão (ex: pedido de avaliação)
 * - appointment_cancelled  → disparo (ex: reagendamento)
 * - contact_inactive       → cliente sem interação há X dias
 * - birthday               → aniversário (requer campo birth_date no contato)
 */

import { toZonedTime } from 'date-fns-tz'
import { addHours } from 'date-fns'
import { query, withTransaction } from '../../db/client'
import { NotFoundError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'
import { sendText, formatPhoneNumber } from '../whatsapp/evolution.client'
import { interpolate, pickRandomMessage } from '../broadcasts/broadcasts.service'
import { logger } from '../../config/logger'

const TIMEZONE = 'America/Sao_Paulo'

interface CreateAutomationDTO {
  name: string
  triggerType: string
  triggerValue?: number
  delayHours: number
  messages: Array<{ text: string }>
  numberId?: string
  sendFrom?: string
  sendUntil?: string
}

// ==========================================================================
// CRUD
// ==========================================================================

export async function listAutomations(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)
  const [rows, count] = await Promise.all([
    query(
      `SELECT id, name, trigger_type, trigger_value, delay_hours,
              messages, send_from, send_until, is_active, created_at
       FROM marketing_automations
       WHERE workspace_id = $1
       ORDER BY name
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    ),
    query<{ count: string }>('SELECT COUNT(*) FROM marketing_automations WHERE workspace_id = $1', [workspaceId]),
  ])
  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function createAutomation(workspaceId: string, dto: CreateAutomationDTO) {
  const result = await query<{ id: string }>(
    `INSERT INTO marketing_automations
       (workspace_id, name, trigger_type, trigger_value, delay_hours, messages,
        number_id, send_from, send_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      workspaceId, dto.name, dto.triggerType, dto.triggerValue || null,
      dto.delayHours, JSON.stringify(dto.messages),
      dto.numberId || null,
      dto.sendFrom || '07:00',
      dto.sendUntil || '19:00',
    ]
  )
  return getAutomation(workspaceId, result.rows[0].id)
}

export async function getAutomation(workspaceId: string, automationId: string) {
  const result = await query(
    `SELECT id, name, trigger_type, trigger_value, delay_hours, messages,
            send_from, send_until, is_active, created_at
     FROM marketing_automations
     WHERE id = $1 AND workspace_id = $2`,
    [automationId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Automação')
  return result.rows[0]
}

export async function updateAutomation(workspaceId: string, automationId: string, dto: Partial<CreateAutomationDTO> & { isActive?: boolean }) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (dto.name !== undefined)         { fields.push(`name = $${i++}`);          values.push(dto.name) }
  if (dto.triggerValue !== undefined) { fields.push(`trigger_value = $${i++}`); values.push(dto.triggerValue) }
  if (dto.delayHours !== undefined)   { fields.push(`delay_hours = $${i++}`);   values.push(dto.delayHours) }
  if (dto.messages !== undefined)     { fields.push(`messages = $${i++}`);      values.push(JSON.stringify(dto.messages)) }
  if (dto.numberId !== undefined)     { fields.push(`number_id = $${i++}`);     values.push(dto.numberId) }
  if (dto.sendFrom !== undefined)     { fields.push(`send_from = $${i++}`);     values.push(dto.sendFrom) }
  if (dto.sendUntil !== undefined)    { fields.push(`send_until = $${i++}`);    values.push(dto.sendUntil) }
  if (dto.isActive !== undefined)     { fields.push(`is_active = $${i++}`);     values.push(dto.isActive) }

  if (fields.length) {
    values.push(workspaceId, automationId)
    await query(`UPDATE marketing_automations SET ${fields.join(', ')} WHERE workspace_id = $${i++} AND id = $${i++}`, values)
  }
  return getAutomation(workspaceId, automationId)
}

export async function deleteAutomation(workspaceId: string, automationId: string) {
  await query('DELETE FROM marketing_automations WHERE workspace_id = $1 AND id = $2', [workspaceId, automationId])
}

// ==========================================================================
// Trigger de evento — chamado ao confirmar, completar, cancelar agendamento
// ==========================================================================

export async function triggerAutomations(
  workspaceId: string,
  triggerType: string,
  contactId: string
): Promise<void> {
  const automations = await query<{
    id: string
    delay_hours: number
    messages: Array<{ text: string }>
    number_id: string | null
    send_from: string
    send_until: string
  }>(
    `SELECT id, delay_hours, messages, number_id, send_from, send_until
     FROM marketing_automations
     WHERE workspace_id = $1 AND trigger_type = $2 AND is_active = true`,
    [workspaceId, triggerType]
  )

  for (const automation of automations.rows) {
    const scheduledAt = addHours(new Date(), automation.delay_hours)
    await query(
      `INSERT INTO automation_executions (automation_id, contact_id, scheduled_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (automation_id, contact_id, scheduled_at) DO NOTHING`,
      [automation.id, contactId, scheduledAt.toISOString()]
    )
  }
}

// ==========================================================================
// Processamento — chamado pelo cron a cada hora
// ==========================================================================

export async function processAutomations(): Promise<void> {
  const now = new Date()

  // Busca execuções pendentes que já passaram do horário agendado
  const pending = await query<{
    id: string
    automation_id: string
    contact_id: string
    workspace_id: string
    messages: Array<{ text: string }>
    number_id: string | null
    send_from: string
    send_until: string
  }>(
    `SELECT ae.id, ae.automation_id, ae.contact_id,
            ma.workspace_id, ma.messages, ma.number_id, ma.send_from, ma.send_until
     FROM automation_executions ae
     JOIN marketing_automations ma ON ma.id = ae.automation_id
     WHERE ae.status = 'pendente' AND ae.scheduled_at <= $1
     LIMIT 100`,
    [now.toISOString()]
  )

  for (const exec of pending.rows) {
    try {
      await executeAutomation(exec)
    } catch (err) {
      await query(
        `UPDATE automation_executions SET status = 'erro', error = $1 WHERE id = $2`,
        [(err as Error).message, exec.id]
      )
      logger.error('Automation execution failed', { execId: exec.id, error: (err as Error).message })
    }
  }

  // Processa inativos separadamente (lógica de segmentação diferente)
  await processInactiveContacts()
}

async function executeAutomation(exec: {
  id: string
  contact_id: string
  workspace_id: string
  messages: Array<{ text: string }>
  number_id: string | null
  send_from: string
  send_until: string
}): Promise<void> {
  const nowZoned = toZonedTime(new Date(), TIMEZONE)
  const [fH, fM] = exec.send_from.split(':').map(Number)
  const [uH, uM] = exec.send_until.split(':').map(Number)
  const currentMins = nowZoned.getHours() * 60 + nowZoned.getMinutes()
  const fromMins = fH * 60 + fM
  const untilMins = uH * 60 + uM

  if (currentMins < fromMins || currentMins > untilMins) {
    // Fora da janela — reagenda para o início da próxima janela
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + (currentMins > untilMins ? 1 : 0))
    tomorrow.setHours(fH, fM, 0, 0)
    await query(
      `UPDATE automation_executions SET scheduled_at = $1 WHERE id = $2`,
      [tomorrow.toISOString(), exec.id]
    )
    return
  }

  const contactResult = await query<{ name: string | null; phone: string }>(
    'SELECT name, phone FROM contacts WHERE id = $1',
    [exec.contact_id]
  )
  if (!contactResult.rowCount) return

  const contact = contactResult.rows[0]
  const numberResult = await query<{ instance_name: string }>(
    `SELECT wn.instance_name FROM whatsapp_numbers wn
     WHERE wn.id = COALESCE($1::uuid, (
       SELECT id FROM whatsapp_numbers
       WHERE workspace_id = $2 AND purpose = 'atendimento' AND is_connected = true LIMIT 1
     ))`,
    [exec.number_id, exec.workspace_id]
  )
  if (!numberResult.rowCount) return

  const template = pickRandomMessage(exec.messages)
  const text = interpolate(template.text, contact)

  await sendText({
    instanceName: numberResult.rows[0].instance_name,
    to: formatPhoneNumber(contact.phone),
    text,
    delay: 500,
  })

  await query(
    `UPDATE automation_executions SET status = 'enviado', sent_at = NOW(), message_sent = $1 WHERE id = $2`,
    [text, exec.id]
  )

  logger.info('Automation executed', { execId: exec.id, contactId: exec.contact_id })
}

async function processInactiveContacts(): Promise<void> {
  const automations = await query<{
    id: string
    workspace_id: string
    trigger_value: number
    messages: Array<{ text: string }>
    number_id: string | null
    send_from: string
    send_until: string
  }>(
    `SELECT id, workspace_id, trigger_value, messages, number_id, send_from, send_until
     FROM marketing_automations
     WHERE trigger_type = 'contact_inactive' AND is_active = true AND trigger_value IS NOT NULL`
  )

  for (const automation of automations.rows) {
    const inactiveSince = new Date(Date.now() - automation.trigger_value * 24 * 60 * 60000)

    const contacts = await query<{ id: string }>(
      `SELECT DISTINCT c.id
       FROM contacts c
       WHERE c.workspace_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM automation_executions ae
           WHERE ae.automation_id = $2 AND ae.contact_id = c.id
             AND ae.scheduled_at > NOW() - INTERVAL '7 days'
         )
         AND (
           SELECT MAX(m.created_at) FROM messages m
           JOIN conversations cv ON cv.id = m.conversation_id
           WHERE cv.contact_id = c.id AND cv.workspace_id = c.workspace_id
         ) < $3`,
      [automation.workspace_id, automation.id, inactiveSince.toISOString()]
    )

    for (const contact of contacts.rows) {
      await query(
        `INSERT INTO automation_executions (automation_id, contact_id, scheduled_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT DO NOTHING`,
        [automation.id, contact.id]
      )
    }
  }
}
