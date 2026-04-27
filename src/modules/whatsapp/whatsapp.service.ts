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
  // Suporta vários formatos da Evolution API:
  // v1: data.qrcode.base64  |  v2: data.base64  |  v2 alt: data.qrcode = string direta
  const d = data as Record<string, unknown>
  const nested = d?.qrcode

  let raw: string | undefined
  if (typeof nested === 'string') {
    raw = nested                                           // qrcode é a própria string base64
  } else if (nested && typeof nested === 'object') {
    raw = (nested as Record<string, unknown>)?.base64 as string | undefined
  }
  raw = raw ?? (d?.base64 as string | undefined)

  if (!raw) {
    logger.debug('QR code update received but no base64 found', { instanceName, keys: Object.keys(d) })
    return
  }

  // Normaliza: garante prefixo data URL para exibição direta no browser
  const qrCode = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`

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

// Extrai QR code base64 de qualquer formato de resposta da Evolution API
function extractQrFromResponse(r: unknown): string | undefined {
  if (!r || typeof r !== 'object') return undefined
  const obj = r as Record<string, unknown>

  // Tenta na ordem: data.qrcode (string), data.qrcode.base64, data.base64,
  //                 data.qr (string), data.code (string)
  const nested = obj.qrcode
  if (typeof nested === 'string' && nested.length > 50) return nested
  if (nested && typeof nested === 'object') {
    const b64 = (nested as Record<string, unknown>).base64
    if (typeof b64 === 'string' && b64.length > 50) return b64
  }

  if (typeof obj.base64 === 'string' && (obj.base64 as string).length > 50) return obj.base64 as string
  if (typeof obj.qr === 'string' && (obj.qr as string).length > 50) return obj.qr as string

  // Evolution v2.2+: a resposta de /instance/connect tem { code, count, pairingCode, base64? }
  // Em alguns casos `code` é o link "WAJ:..." e `base64` é a imagem PNG
  return undefined
}

// Gerenciamento de instâncias
export async function connectNumber(workspaceId: string, numberId: string) {
  const result = await query<{ instance_name: string }>(
    'SELECT instance_name FROM whatsapp_numbers WHERE id = $1 AND workspace_id = $2',
    [numberId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Número')

  const instanceName = result.rows[0].instance_name
  const baseUrl = env.INTERNAL_APP_URL ?? `${env.APP_URL}/api`
  const webhookUrl = `${baseUrl}/webhooks/whatsapp/webhook/${instanceName}`

  // Limpa QR antigo do banco antes de gerar novo
  await query(`UPDATE whatsapp_numbers SET qr_code = NULL WHERE instance_name = $1`, [instanceName])

  let response: unknown
  let needsRecreate = false

  // Se a instância já existe no Evolution, apenas solicita reconexão
  try {
    const status = await evolution.getInstanceStatus(instanceName)
    const state = (status as Record<string, Record<string, string>>)?.instance?.state
      ?? (status as Record<string, string>)?.state

    if (state === 'open') {
      logger.info('WhatsApp instance already connected', { instanceName })
      return status
    }

    // Garante que o webhook está configurado (instâncias antigas podem ter sido criadas sem)
    try {
      await evolution.setWebhook(instanceName, webhookUrl)
      logger.info('Webhook (re)configured for existing instance', { instanceName })
    } catch (whErr) {
      logger.warn('setWebhook failed on existing instance', { instanceName, error: (whErr as Error).message })
    }

    logger.info('WhatsApp instance exists, requesting QR', { instanceName, state })
    response = await evolution.getQrCode(instanceName)
  } catch (existErr: unknown) {
    const httpStatus = (existErr as { response?: { status?: number } })?.response?.status
    if (httpStatus !== 404 && httpStatus !== 400) throw existErr
    needsRecreate = true
  }

  // Loga estrutura da resposta para debug
  logger.info('Evolution connect response shape', {
    instanceName,
    keys: response && typeof response === 'object' ? Object.keys(response as object) : null,
    hasBase64: !!(response as Record<string, unknown>)?.base64,
    qrcodeType: typeof (response as Record<string, unknown>)?.qrcode,
  })

  let qrRaw = extractQrFromResponse(response)

  // Se a instância não existia OU se existia mas não retornou QR → recria do zero
  if (needsRecreate || !qrRaw) {
    logger.info('Recreating WhatsApp instance to get fresh QR', { instanceName, needsRecreate, hadQr: !!qrRaw })
    try {
      await evolution.deleteInstance(instanceName).catch(() => {/* já não existe */})
    } catch { /* ignore */ }

    response = await evolution.createInstance(instanceName, webhookUrl)
    logger.info('Evolution createInstance response shape', {
      instanceName,
      keys: response && typeof response === 'object' ? Object.keys(response as object) : null,
    })
    qrRaw = extractQrFromResponse(response)
  }

  if (qrRaw) {
    const qrBase64 = qrRaw.startsWith('data:') ? qrRaw : `data:image/png;base64,${qrRaw}`
    await query(
      `UPDATE whatsapp_numbers SET qr_code = $1 WHERE instance_name = $2`,
      [qrBase64, instanceName]
    )
    logger.info('QR code saved from connect response', { instanceName, length: qrBase64.length })
  } else {
    logger.warn('No QR in response — aguardando webhook qrcode.updated', { instanceName })
  }

  return response
}

// Reseta a instância no Evolution: logout → delete → wait → create (gera QR fresco)
export async function resetInstance(workspaceId: string, numberId: string) {
  const result = await query<{ instance_name: string }>(
    'SELECT instance_name FROM whatsapp_numbers WHERE id = $1 AND workspace_id = $2',
    [numberId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Número')

  const instanceName = result.rows[0].instance_name
  const baseUrl = env.INTERNAL_APP_URL ?? `${env.APP_URL}/api`
  const webhookUrl = `${baseUrl}/webhooks/whatsapp/webhook/${instanceName}`

  logger.info('Resetting WhatsApp instance', { instanceName })

  // Limpa QR e estado de conexão no banco
  await query(
    `UPDATE whatsapp_numbers SET qr_code = NULL, is_connected = false WHERE instance_name = $1`,
    [instanceName]
  )

  // 1. Logout — desconecta do WhatsApp se estiver conectada
  try {
    await evolution.logoutInstance(instanceName)
    logger.info('Instance logged out', { instanceName })
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    logger.warn('Logout failed (continuando)', { instanceName, status, error: (err as Error).message })
  }

  // 2. Delete — remove a instância
  try {
    await evolution.deleteInstance(instanceName)
    logger.info('Instance deleted', { instanceName })
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    logger.warn('Delete failed (continuando)', { instanceName, status, error: (err as Error).message })
  }

  // 3. Aguarda Evolution liberar o nome (pode ficar reservado por alguns segundos)
  await new Promise(r => setTimeout(r, 2000))

  // 4. Create — cria nova instância (gera QR)
  let createResponse: unknown
  try {
    createResponse = await evolution.createInstance(instanceName, webhookUrl)
  } catch (err) {
    const errObj = err as { response?: { status?: number; data?: unknown } }
    logger.error('Create instance failed during reset', {
      instanceName,
      status: errObj?.response?.status,
      data: errObj?.response?.data,
    })
    throw new Error(
      `Não foi possível recriar a instância (status ${errObj?.response?.status ?? 'desconhecido'}). ` +
      `Verifique se a Evolution API está acessível.`
    )
  }

  logger.info('createInstance response', {
    instanceName,
    keys: createResponse && typeof createResponse === 'object' ? Object.keys(createResponse as object) : null,
    qrcodeKeys: createResponse && typeof (createResponse as Record<string, unknown>).qrcode === 'object'
      ? Object.keys((createResponse as Record<string, Record<string, unknown>>).qrcode)
      : null,
  })

  let qrRaw = extractQrFromResponse(createResponse)

  // 5. Se o create não trouxe QR, chama /connect explicitamente (Evolution v2 às vezes só retorna lá)
  if (!qrRaw) {
    await new Promise(r => setTimeout(r, 1500))
    try {
      const connectResponse = await evolution.getQrCode(instanceName)
      logger.info('connect response (post-create)', {
        instanceName,
        keys: connectResponse && typeof connectResponse === 'object' ? Object.keys(connectResponse as object) : null,
      })
      qrRaw = extractQrFromResponse(connectResponse)
    } catch (err) {
      logger.warn('connect call after create failed', { instanceName, error: (err as Error).message })
    }
  }

  // Salva snapshot de debug pra inspecionar via frontend quando QR ficar null
  const debugSnapshot = {
    timestamp: new Date().toISOString(),
    createKeys: createResponse && typeof createResponse === 'object' ? Object.keys(createResponse as object) : null,
    createQrcodeShape: createResponse && typeof (createResponse as Record<string, unknown>).qrcode === 'object'
      ? Object.keys((createResponse as Record<string, Record<string, unknown>>).qrcode)
      : typeof (createResponse as Record<string, unknown>)?.qrcode,
    extracted: !!qrRaw,
  }

  if (qrRaw) {
    const qrBase64 = qrRaw.startsWith('data:') ? qrRaw : `data:image/png;base64,${qrRaw}`
    await query(
      `UPDATE whatsapp_numbers SET qr_code = $1 WHERE instance_name = $2`,
      [qrBase64, instanceName]
    )
    logger.info('QR saved after reset', { instanceName, length: qrBase64.length })
  } else {
    logger.warn('Reset OK but no QR — aguardando webhook qrcode.updated', { instanceName, debugSnapshot })
  }

  return { ...((createResponse ?? {}) as object), _debug: debugSnapshot }
}

export async function getQrCode(workspaceId: string, numberId: string) {
  const result = await query<{ instance_name: string; qr_code: string; is_connected: boolean }>(
    'SELECT instance_name, qr_code, is_connected FROM whatsapp_numbers WHERE id = $1 AND workspace_id = $2',
    [numberId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Número')
  return result.rows[0]
}

// Debug: chama Evolution e retorna estrutura completa de status + connect + fetch + webhook
export async function debugInstance(workspaceId: string, numberId: string) {
  const result = await query<{ instance_name: string }>(
    'SELECT instance_name FROM whatsapp_numbers WHERE id = $1 AND workspace_id = $2',
    [numberId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Número')

  const instanceName = result.rows[0].instance_name
  const baseUrl = env.INTERNAL_APP_URL ?? `${env.APP_URL}/api`
  const expectedWebhookUrl = `${baseUrl}/webhooks/whatsapp/webhook/${instanceName}`

  const out: Record<string, unknown> = {
    instanceName,
    evolutionUrl: env.EVOLUTION_API_URL,
    expectedWebhookUrl,
    internalAppUrl: env.INTERNAL_APP_URL ?? null,
    appUrl: env.APP_URL ?? null,
  }

  // 1. Status — desta vez retornando o VALOR completo, não só keys
  try {
    const status = await evolution.getInstanceStatus(instanceName)
    out.status = status   // resposta completa
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown } }
    out.status = { error: true, httpStatus: e?.response?.status, data: e?.response?.data }
  }

  // 2. Connect — resposta completa (mas trunca strings longas pra não vazar o QR)
  try {
    const connect = await evolution.getQrCode(instanceName)
    if (connect && typeof connect === 'object') {
      const truncated: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(connect)) {
        if (typeof v === 'string' && v.length > 200) truncated[k] = `[string ${v.length} chars]`
        else truncated[k] = v
      }
      out.connect = truncated
    } else out.connect = connect
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown } }
    out.connect = { error: true, httpStatus: e?.response?.status, data: e?.response?.data }
  }

  // 3. fetchInstances — mostra a config gravada do webhook na Evolution
  try {
    const fetchUrl = `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`
    const axios = (await import('axios')).default
    const response = await axios.get(env.EVOLUTION_API_URL + fetchUrl, {
      headers: { apikey: env.EVOLUTION_API_KEY },
      timeout: 8000,
    })
    out.fetchInstances = response.data
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string }
    out.fetchInstances = { error: true, httpStatus: e?.response?.status, message: e?.message, data: e?.response?.data }
  }

  // 3b. webhook config — endpoint dedicado da Evolution v2
  try {
    out.webhookConfig = await evolution.getWebhook(instanceName)
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string }
    out.webhookConfig = { error: true, httpStatus: e?.response?.status, message: e?.message, data: e?.response?.data }
  }

  // 4. Test webhook — chama o próprio webhook a partir do container API pra validar conectividade interna
  try {
    const axios = (await import('axios')).default
    await axios.post(expectedWebhookUrl, {
      event: 'TEST_FROM_DEBUG',
      data: { ping: true },
    }, { timeout: 5000 })
    out.webhookSelfTest = { ok: true }
  } catch (err) {
    const e = err as { response?: { status?: number }; message?: string; code?: string }
    out.webhookSelfTest = { ok: false, message: e?.message, code: e?.code, httpStatus: e?.response?.status }
  }

  return out
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
