/**
 * Payment Service
 *
 * Fluxo:
 * 1. Appointment criado como PRE_RESERVADO
 * 2. createPaymentLink() → gera link no gateway, salva payments com status=pendente
 * 3. Webhook do gateway → handlePaymentWebhook()
 *    - pago    → CONFIRMADO
 *    - expirado/falhou → EXPIRADO (libera slots)
 *
 * Regras de remarcação:
 * - Cancelamento >= 24h antes → pode remarcar sem nova taxa (isenção)
 * - Cancelamento < 24h ou no-show → nova taxa obrigatória
 */

import { differenceInHours } from 'date-fns'
import { query, withTransaction } from '../../db/client'
import { NotFoundError, AppError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'
import { createGateway, GatewayName, CheckoutParams } from './payment.gateway'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import crypto from 'crypto'

// ==========================================================================
// Config do gateway por workspace
// ==========================================================================

interface GatewayConfig {
  provider: GatewayName
  accessToken: string | null
  apiKey: string | null
  webhookSecret: string | null
  publicKey: string | null
  clientId: string | null
  clientSecret: string | null
  isActive: boolean
}

async function getGatewayConfig(workspaceId: string): Promise<GatewayConfig> {
  const result = await query<{
    provider: string
    access_token: string | null
    api_key: string | null
    webhook_secret: string | null
    public_key: string | null
    client_id: string | null
    client_secret: string | null
    is_active: boolean
  }>(
    `SELECT provider, access_token, api_key, webhook_secret,
            public_key, client_id, client_secret, is_active
     FROM payment_gateway_configs WHERE workspace_id = $1`,
    [workspaceId]
  )

  if (!result.rowCount || !result.rows[0].is_active) {
    throw new AppError('Gateway de pagamento não configurado para este workspace', 503)
  }

  const r = result.rows[0]
  const decrypt = (v: string | null) => v ? decryptCredential(v) : null

  return {
    provider: r.provider as GatewayName,
    accessToken: decrypt(r.access_token),
    apiKey: decrypt(r.api_key),
    webhookSecret: decrypt(r.webhook_secret),
    publicKey: decrypt(r.public_key),
    clientId: decrypt(r.client_id),
    clientSecret: decrypt(r.client_secret),
    isActive: r.is_active,
  }
}

export async function saveGatewayConfig(
  workspaceId: string,
  provider: GatewayName,
  credentials: {
    accessToken?: string
    apiKey?: string
    webhookSecret?: string
    publicKey?: string
    clientId?: string
    clientSecret?: string
  }
) {
  const encrypt = (v: string | undefined) => v ? encryptCredential(v) : null

  await query(
    `INSERT INTO payment_gateway_configs
       (workspace_id, provider, access_token, api_key, webhook_secret,
        public_key, client_id, client_secret, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
     ON CONFLICT (workspace_id) DO UPDATE
     SET provider        = EXCLUDED.provider,
         access_token    = COALESCE(EXCLUDED.access_token,    payment_gateway_configs.access_token),
         api_key         = COALESCE(EXCLUDED.api_key,         payment_gateway_configs.api_key),
         webhook_secret  = COALESCE(EXCLUDED.webhook_secret,  payment_gateway_configs.webhook_secret),
         public_key      = COALESCE(EXCLUDED.public_key,      payment_gateway_configs.public_key),
         client_id       = COALESCE(EXCLUDED.client_id,       payment_gateway_configs.client_id),
         client_secret   = COALESCE(EXCLUDED.client_secret,   payment_gateway_configs.client_secret),
         is_active = true`,
    [
      workspaceId,
      provider,
      encrypt(credentials.accessToken),
      encrypt(credentials.apiKey),
      encrypt(credentials.webhookSecret),
      encrypt(credentials.publicKey),
      encrypt(credentials.clientId),
      encrypt(credentials.clientSecret),
    ]
  )
}

// Returns provider + whether config exists (never returns raw credentials)
export async function getGatewayStatus(workspaceId: string) {
  const result = await query<{ provider: string; is_active: boolean }>(
    `SELECT provider, is_active FROM payment_gateway_configs WHERE workspace_id = $1`,
    [workspaceId]
  )
  if (!result.rowCount) return { configured: false, provider: null, isActive: false }
  return {
    configured: true,
    provider: result.rows[0].provider,
    isActive: result.rows[0].is_active,
  }
}

// ==========================================================================
// Criar link de pagamento
// ==========================================================================

export async function createPaymentLink(workspaceId: string, appointmentId: string): Promise<string> {
  const apptResult = await query<{
    id: string
    status: string
    deposit_amount: number
    total_price: number
    starts_at: string
    expires_at: string
    contact_id: string
    contact_name: string
    contact_phone: string
    services_summary: string
  }>(
    `SELECT a.id, a.status, a.deposit_amount, a.total_price, a.starts_at, a.expires_at,
            c.id as contact_id, c.name as contact_name, c.phone as contact_phone,
            string_agg(s.name, ', ') as services_summary
     FROM appointments a
     JOIN contacts c ON c.id = a.contact_id
     JOIN appointment_services aps ON aps.appointment_id = a.id
     JOIN services s ON s.id = aps.service_id
     WHERE a.id = $1 AND a.workspace_id = $2
     GROUP BY a.id, c.id`,
    [appointmentId, workspaceId]
  )

  if (!apptResult.rowCount) throw new NotFoundError('Agendamento')
  const appt = apptResult.rows[0]

  if (appt.status !== 'PRE_RESERVADO') {
    throw new AppError('Pagamento só pode ser gerado para agendamentos PRE_RESERVADO', 400)
  }

  const depositAmount = Number(appt.deposit_amount)
  if (depositAmount <= 0) {
    // Sem taxa de reserva → confirma direto
    await query(
      `UPDATE appointments SET status = 'CONFIRMADO', confirmed_at = NOW(), expires_at = NULL
       WHERE id = $1`,
      [appointmentId]
    )
    return 'SEM_TAXA'
  }

  // Verifica se já tem pagamento pendente
  const existing = await query<{ id: string; checkout_url: string }>(
    `SELECT id, checkout_url FROM payments
     WHERE appointment_id = $1 AND status = 'pendente'`,
    [appointmentId]
  )
  if (existing.rowCount) return existing.rows[0].checkout_url!

  const config = await getGatewayConfig(workspaceId)
  const gateway = createGateway(config.provider, {
    accessToken: config.accessToken ?? undefined,
    apiKey: config.apiKey ?? undefined,
  })

  const notificationUrl = `${env.APP_URL}/payments/webhook/${config.provider}/${workspaceId}`

  const checkoutParams: CheckoutParams = {
    externalReference: appointmentId,
    title: appt.services_summary || 'Reserva de serviço',
    amount: depositAmount,
    payerName: appt.contact_name || appt.contact_phone,
    payerPhone: appt.contact_phone,
    notificationUrl,
    expiresAt: new Date(appt.expires_at),
  }

  const checkout = await gateway.createCheckout(checkoutParams)

  await query(
    `INSERT INTO payments
       (workspace_id, appointment_id, amount, status, provider, external_id, checkout_url, expires_at)
     VALUES ($1,$2,$3,'pendente',$4,$5,$6,$7)`,
    [
      workspaceId, appointmentId, depositAmount,
      checkout.provider, checkout.externalId,
      checkout.checkoutUrl, appt.expires_at,
    ]
  )

  logger.info('Payment link created', { appointmentId, provider: checkout.provider, amount: depositAmount })
  return checkout.checkoutUrl
}

// ==========================================================================
// Webhook do gateway
// ==========================================================================

export async function handlePaymentWebhook(
  provider: string,
  workspaceId: string,
  body: unknown,
  headers: Record<string, string>
): Promise<void> {
  const config = await getGatewayConfig(workspaceId)
  const gateway = createGateway(config.provider, {
    accessToken: config.accessToken ?? undefined,
    apiKey: config.apiKey ?? undefined,
  })

  // Valida assinatura se configurada
  if (config.webhookSecret) {
    const valid = validateWebhookSignature(provider, body, headers, config.webhookSecret)
    if (!valid) {
      logger.warn('Invalid webhook signature', { provider, workspaceId })
      return
    }
  }

  const event = await gateway.parseWebhook(body, headers)
  if (!event) return

  logger.info('Payment webhook received', { provider, externalId: event.externalId, status: event.status })

  await processPaymentEvent(workspaceId, event.externalId, event.status)
}

async function processPaymentEvent(
  workspaceId: string,
  externalId: string,
  status: 'pago' | 'expirado' | 'estornado' | 'pendente'
): Promise<void> {
  const paymentResult = await query<{ id: string; appointment_id: string; status: string }>(
    `SELECT id, appointment_id, status FROM payments
     WHERE external_id = $1 AND workspace_id = $2`,
    [externalId, workspaceId]
  )

  if (!paymentResult.rowCount) {
    logger.warn('Payment not found for webhook', { externalId, workspaceId })
    return
  }

  const payment = paymentResult.rows[0]
  if (payment.status === status) return // idempotente

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE payments SET status = $1, paid_at = CASE WHEN $1 = 'pago' THEN NOW() ELSE NULL END
       WHERE id = $2`,
      [status, payment.id]
    )

    if (status === 'pago') {
      await client.query(
        `UPDATE appointments
         SET status = 'CONFIRMADO', confirmed_at = NOW(), expires_at = NULL
         WHERE id = $1 AND status = 'PRE_RESERVADO'`,
        [payment.appointment_id]
      )
      logger.info('Appointment confirmed via payment', { appointmentId: payment.appointment_id })

      // Dispara confirmação WhatsApp em background
      import('../notifications/notifications.service')
        .then(({ sendPaymentConfirmation }) =>
          sendPaymentConfirmation(workspaceId, payment.appointment_id)
        )
        .catch((err) => logger.error('Payment confirmation notify failed', { error: (err as Error).message }))
    } else if (status === 'expirado' || status === 'estornado') {
      await client.query(
        `UPDATE appointments SET status = 'EXPIRADO'
         WHERE id = $1 AND status = 'PRE_RESERVADO'`,
        [payment.appointment_id]
      )
    }
  })
}

// ==========================================================================
// Regras de cancelamento / remarcação
// ==========================================================================

export interface CancellationPolicy {
  requiresNewDeposit: boolean
  reason: string
}

export async function checkCancellationPolicy(
  workspaceId: string,
  appointmentId: string
): Promise<CancellationPolicy> {
  const result = await query<{ starts_at: string; status: string }>(
    `SELECT starts_at, status FROM appointments WHERE id = $1 AND workspace_id = $2`,
    [appointmentId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Agendamento')

  const { starts_at, status } = result.rows[0]
  const hoursUntil = differenceInHours(new Date(starts_at), new Date())

  if (status === 'NO_SHOW') {
    return { requiresNewDeposit: true, reason: 'No-show: nova taxa obrigatória' }
  }

  if (hoursUntil < 24) {
    return {
      requiresNewDeposit: true,
      reason: `Cancelamento com menos de 24h de antecedência: nova taxa obrigatória`,
    }
  }

  return { requiresNewDeposit: false, reason: 'Cancelamento com 24h+ de antecedência: isento de nova taxa' }
}

export async function refundPayment(workspaceId: string, appointmentId: string): Promise<void> {
  const result = await query<{ id: string; external_id: string; provider: string; amount: number }>(
    `SELECT id, external_id, provider, amount FROM payments
     WHERE appointment_id = $1 AND workspace_id = $2 AND status = 'pago'`,
    [appointmentId, workspaceId]
  )

  if (!result.rowCount) return // Sem pagamento pago para estornar

  // Registra intenção de estorno (a execução depende do gateway)
  await query(
    `UPDATE payments SET status = 'estornado' WHERE id = $1`,
    [result.rows[0].id]
  )

  logger.info('Payment refund registered', {
    paymentId: result.rows[0].id,
    provider: result.rows[0].provider,
    amount: result.rows[0].amount,
  })
}

// ==========================================================================
// Listagem
// ==========================================================================

export async function listPayments(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)
  const conditions: string[] = ['p.workspace_id = $1']
  const values: unknown[] = [workspaceId]
  let i = 2

  if (queryParams.status) { conditions.push(`p.status = $${i++}`); values.push(queryParams.status) }
  if (queryParams.appointmentId) { conditions.push(`p.appointment_id = $${i++}`); values.push(queryParams.appointmentId) }

  const where = conditions.join(' AND ')

  const [rows, count] = await Promise.all([
    query(
      `SELECT p.id, p.amount, p.status, p.provider, p.checkout_url,
              p.paid_at, p.expires_at, p.created_at,
              a.id as appointment_id, a.starts_at,
              c.name as contact_name, c.phone as contact_phone
       FROM payments p
       JOIN appointments a ON a.id = p.appointment_id
       JOIN contacts c ON c.id = a.contact_id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(`SELECT COUNT(*) FROM payments p WHERE ${where}`, values),
  ])

  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

// ==========================================================================
// Crypto helpers
// ==========================================================================

function encryptCredential(value: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(env.ENCRYPTION_KEY), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptCredential(value: string): string {
  const [ivHex, dataHex] = value.split(':')
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(env.ENCRYPTION_KEY),
    Buffer.from(ivHex, 'hex')
  )
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

function validateWebhookSignature(
  provider: string,
  body: unknown,
  headers: Record<string, string>,
  secret: string
): boolean {
  try {
    if (provider === 'mercadopago') {
      const xSignature = headers['x-signature']
      const xRequestId = headers['x-request-id']
      if (!xSignature || !xRequestId) return false

      const parts = xSignature.split(',')
      const ts = parts.find((p) => p.startsWith('ts='))?.split('=')[1]
      const v1 = parts.find((p) => p.startsWith('v1='))?.split('=')[1]

      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
      const manifest = `id:${(body as { data?: { id?: string } }).data?.id};request-id:${xRequestId};ts:${ts};`
      const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

      return expected === v1
    }
    return true
  } catch {
    return false
  }
}
