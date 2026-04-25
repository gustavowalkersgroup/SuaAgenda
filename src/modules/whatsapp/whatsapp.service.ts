import { query } from '../../db/client'
import * as evolution from './evolution.client'
import { findOrCreateContact } from '../contacts/contacts.service'
import { findOrCreateConversation, saveMessage } from '../conversations/conversations.service'
import { enqueueAiMessage } from '../../queues/ai.queue'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { NotFoundError, ConflictError } from '../../shared/errors'

interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: Record<string, unknown>
}

export async function handleWebhook(payload: EvolutionWebhookPayload): Promise<void> {
  const { event, instance, data } = payload

  // Evolution v1 usa lowercase+ponto, v2 usa UPPERCASE+underscore
  const normalised = event?.toLowerCase().replace(/_/g, '.')

  switch (normalised) {
    case 'messages.upsert':
      await handleInboundMessage(instance, data)
      break
    case 'messages.update':
      await handleMessageUpdate(data)
      break
    case 'connection.update':
      await handleConnectionUpdate(instance, data)
      break
    case 'qrcode.updated':
      await handleQrUpdate(instance, data)
      break
    default:
      logger.debug('Unhandled Evolution event', { event, normalised })
  }
}

async function handleInboundMessage(instanceName: string, data: Record<string, unknown>): Promise<void> {
  const message = data as {
    key: { remoteJid: string; fromMe: boolean; id: string }
    message: { conversation?: string; extendedTextMessage?: { text: string }; imageMessage?: unknown }
    pushName?: string
  }

  if (message.key.fromMe) return // Ignora mensagens enviadas pelo próprio número

  const jid = message.key.remoteJid
  if (!jid || jid.includes('@g.us')) return // Ignora grupos

  const phone = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const text =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    ''

  const numberResult = await query<{ id: string; workspace_id: string }>(
    'SELECT id, workspace_id FROM whatsapp_numbers WHERE instance_name = $1',
    [instanceName]
  )

  if (!numberResult.rowCount) {
    logger.warn('Received message for unknown instance', { instanceName })
    return
  }

  const { id: numberId, workspace_id: workspaceId } = numberResult.rows[0]

  const contactId = await findOrCreateContact(workspaceId, phone, message.pushName)
  const conversationId = await findOrCreateConversation(workspaceId, contactId, numberId)

  await saveMessage({
    workspaceId,
    conversationId,
    direction: 'inbound',
    type: message.message?.imageMessage ? 'image' : 'text',
    content: text,
    externalId: message.key.id,
  })

  logger.debug('Inbound message saved', { workspaceId, conversationId, phone })

  // Dispara agente de IA apenas para mensagens de texto
  if (text) {
    await enqueueAiMessage({
      workspaceId,
      conversationId,
      contactId,
      contactPhone: phone,
      contactName: message.pushName || null,
      inboundText: text,
    })
  }
}

async function handleMessageUpdate(data: Record<string, unknown>): Promise<void> {
  const updates = (data as unknown as { key: { id: string }; update: { status?: number } }[])
  if (!Array.isArray(updates)) return

  for (const update of updates) {
    const externalId = update.key?.id
    const statusCode = update.update?.status

    if (!externalId || !statusCode) continue

    const statusMap: Record<number, string> = {
      1: 'sent',
      2: 'delivered',
      3: 'read',
      4: 'failed',
    }
    const status = statusMap[statusCode]
    if (!status) continue

    await query(
      `UPDATE messages SET status = $1 WHERE external_id = $2`,
      [status, externalId]
    )
  }
}

async function handleConnectionUpdate(instanceName: string, data: Record<string, unknown>): Promise<void> {
  const state = (data as { state: string }).state
  const isConnected = state === 'open'

  await query(
    `UPDATE whatsapp_numbers
     SET is_connected = $1, connected_at = CASE WHEN $1 THEN NOW() ELSE connected_at END
     WHERE instance_name = $2`,
    [isConnected, instanceName]
  )

  logger.info('WhatsApp connection update', { instanceName, state })
}

async function handleQrUpdate(instanceName: string, data: Record<string, unknown>): Promise<void> {
  // Suporta v1: data.qrcode.base64 e v2: data.base64 ou data.qrcode.base64
  const d = data as Record<string, unknown>
  const qrCode =
    (d?.qrcode as Record<string, unknown>)?.base64 as string |
    d?.base64 as string |
    undefined

  if (!qrCode) {
    logger.debug('QR code update received but no base64 found', { instanceName, keys: Object.keys(d) })
    return
  }

  await query(
    `UPDATE whatsapp_numbers SET qr_code = $1 WHERE instance_name = $2`,
    [qrCode, instanceName]
  )
  logger.info('QR code stored', { instanceName })
}

export async function sendMessage(
  workspaceId: string,
  conversationId: string,
  text: string,
  sentBy?: string
) {
  const convResult = await query<{
    contact_phone: string
    instance_name: string
    number_id: string
  }>(
    `SELECT c.phone as contact_phone, wn.instance_name, cv.number_id
     FROM conversations cv
     JOIN contacts c ON c.id = cv.contact_id
     LEFT JOIN whatsapp_numbers wn ON wn.id = cv.number_id
     WHERE cv.id = $1 AND cv.workspace_id = $2`,
    [conversationId, workspaceId]
  )

  if (!convResult.rowCount) throw new NotFoundError('Conversa')

  const { contact_phone, instance_name, number_id } = convResult.rows[0]
  const to = evolution.formatPhoneNumber(contact_phone)

  const sent = await evolution.sendText({
    instanceName: instance_name,
    to,
    text,
    delay: 500,
  })

  await saveMessage({
    workspaceId,
    conversationId,
    direction: 'outbound',
    type: 'text',
    content: text,
    status: 'sent',
    externalId: sent?.key?.id,
    sentBy: sentBy || null,
  })
}

// Gerenciamento de instâncias
export async function connectNumber(workspaceId: string, numberId: string) {
  const result = await query<{ instance_name: string }>(
    'SELECT instance_name FROM whatsapp_numbers WHERE id = $1 AND workspace_id = $2',
    [numberId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Número')

  const instanceName = result.rows[0].instance_name
  // URL interna Docker → sem nginx no meio
  // Rota registrada em: app.use('/webhooks/whatsapp', whatsappRoutes)
  //                     router.post('/webhook/:instance', ...)
  // → full path: /webhooks/whatsapp/webhook/:instance
  const baseUrl = env.INTERNAL_APP_URL ?? `${env.APP_URL}/api`
  const webhookUrl = `${baseUrl}/webhooks/whatsapp/webhook/${instanceName}`
  return evolution.createInstance(instanceName, webhookUrl)
}

export async function getQrCode(workspaceId: string, numberId: string) {
  const result = await query<{ instance_name: string; qr_code: string; is_connected: boolean }>(
    'SELECT instance_name, qr_code, is_connected FROM whatsapp_numbers WHERE id = $1 AND workspace_id = $2',
    [numberId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Número')
  return result.rows[0]
}

export async function addNumber(workspaceId: string, params: {
  instanceName: string
  phoneNumber: string
  displayName?: string
  purpose?: string
}) {
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM whatsapp_numbers WHERE workspace_id = $1`,
    [workspaceId]
  )
  if (Number(countResult.rows[0].count) >= 2) {
    throw new ConflictError('Limite de 2 números por workspace atingido')
  }

  const result = await query<{ id: string }>(
    `INSERT INTO whatsapp_numbers (workspace_id, instance_name, phone_number, display_name, purpose)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [workspaceId, params.instanceName, params.phoneNumber, params.displayName || null, params.purpose || 'atendimento']
  )
  return result.rows[0].id
}

export async function listNumbers(workspaceId: string) {
  const result = await query(
    `SELECT id, instance_name, phone_number, display_name, purpose, is_connected, connected_at
     FROM whatsapp_numbers WHERE workspace_id = $1 ORDER BY created_at`,
    [workspaceId]
  )
  return result.rows
}
