/**
 * Payment Gateway — Abstração
 *
 * Interface única para múltiplos gateways. Troca de provider sem mudar lógica de negócio.
 * Implementações: MercadoPago (padrão BR), Stripe, Asaas.
 */

export interface CheckoutParams {
  externalReference: string      // appointment_id
  title: string                  // descrição do serviço(s)
  amount: number                 // valor em reais
  payerName: string
  payerEmail?: string
  payerPhone?: string
  notificationUrl: string        // webhook URL
  expiresAt: Date
}

export interface CheckoutResult {
  checkoutUrl: string
  externalId: string             // ID do pagamento no gateway
  provider: string
}

export interface WebhookEvent {
  provider: string
  externalId: string
  status: 'pago' | 'expirado' | 'estornado' | 'pendente'
  rawBody: unknown
}

export interface PaymentGateway {
  name: string
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>
  parseWebhook(body: unknown, headers: Record<string, string>): Promise<WebhookEvent | null>
  getStatus(externalId: string): Promise<'pago' | 'expirado' | 'estornado' | 'pendente'>
}

// ==========================================================================
// MercadoPago
// ==========================================================================

import axios from 'axios'
import { logger } from '../../config/logger'

export class MercadoPagoGateway implements PaymentGateway {
  name = 'mercadopago'

  private http = axios.create({
    baseURL: 'https://api.mercadopago.com',
    headers: { 'Content-Type': 'application/json' },
  })

  constructor(private accessToken: string) {
    this.http.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const expiresISO = params.expiresAt.toISOString().replace(/\.\d{3}Z$/, '.000-03:00')

    const body = {
      external_reference: params.externalReference,
      items: [
        {
          title: params.title,
          quantity: 1,
          unit_price: params.amount,
          currency_id: 'BRL',
        },
      ],
      payer: {
        name: params.payerName,
        email: params.payerEmail || 'cliente@email.com',
        phone: params.payerPhone ? { number: params.payerPhone } : undefined,
      },
      notification_url: params.notificationUrl,
      expiration_date_to: expiresISO,
      auto_return: 'approved',
      back_urls: {
        success: `${params.notificationUrl}/success`,
        failure: `${params.notificationUrl}/failure`,
        pending: `${params.notificationUrl}/pending`,
      },
    }

    const response = await this.http.post('/checkout/preferences', body)
    const data = response.data as { id: string; init_point: string }

    return {
      checkoutUrl: data.init_point,
      externalId: data.id,
      provider: 'mercadopago',
    }
  }

  async parseWebhook(body: unknown, _headers: Record<string, string>): Promise<WebhookEvent | null> {
    const payload = body as { type?: string; data?: { id?: string }; action?: string; id?: string }

    if (payload.type !== 'payment') return null

    const paymentId = payload.data?.id || String(payload.id)
    if (!paymentId) return null

    try {
      const status = await this.getStatus(paymentId)
      return { provider: 'mercadopago', externalId: paymentId, status, rawBody: body }
    } catch (err) {
      logger.error('MercadoPago webhook parse error', { error: (err as Error).message })
      return null
    }
  }

  async getStatus(externalId: string): Promise<'pago' | 'expirado' | 'estornado' | 'pendente'> {
    const response = await this.http.get(`/v1/payments/${externalId}`)
    const data = response.data as { status: string }

    const map: Record<string, 'pago' | 'expirado' | 'estornado' | 'pendente'> = {
      approved: 'pago',
      rejected: 'expirado',
      cancelled: 'expirado',
      refunded: 'estornado',
      charged_back: 'estornado',
      pending: 'pendente',
      in_process: 'pendente',
      authorized: 'pendente',
    }

    return map[data.status] ?? 'pendente'
  }
}

// ==========================================================================
// Asaas
// ==========================================================================

export class AsaasGateway implements PaymentGateway {
  name = 'asaas'

  private http = axios.create({
    baseURL: 'https://api.asaas.com/v3',
    headers: { 'Content-Type': 'application/json' },
  })

  constructor(private apiKey: string) {
    this.http.defaults.headers.common['access_token'] = apiKey
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    // Cria cobrança PIX no Asaas
    const body = {
      customer: params.payerName,
      billingType: 'PIX',
      value: params.amount,
      dueDate: params.expiresAt.toISOString().split('T')[0],
      description: params.title,
      externalReference: params.externalReference,
      postalService: false,
    }

    const response = await this.http.post('/payments', body)
    const data = response.data as { id: string; invoiceUrl: string }

    return {
      checkoutUrl: data.invoiceUrl,
      externalId: data.id,
      provider: 'asaas',
    }
  }

  async parseWebhook(body: unknown, _headers: Record<string, string>): Promise<WebhookEvent | null> {
    const payload = body as { event?: string; payment?: { id?: string; status?: string } }

    if (!payload.payment?.id) return null

    const statusMap: Record<string, 'pago' | 'expirado' | 'estornado' | 'pendente'> = {
      RECEIVED: 'pago',
      CONFIRMED: 'pago',
      OVERDUE: 'expirado',
      REFUNDED: 'estornado',
      PENDING: 'pendente',
      AWAITING_RISK_ANALYSIS: 'pendente',
    }

    const status = statusMap[payload.payment.status ?? ''] ?? 'pendente'
    return { provider: 'asaas', externalId: payload.payment.id, status, rawBody: body }
  }

  async getStatus(externalId: string): Promise<'pago' | 'expirado' | 'estornado' | 'pendente'> {
    const response = await this.http.get(`/payments/${externalId}`)
    const data = response.data as { status: string }
    const map: Record<string, 'pago' | 'expirado' | 'estornado' | 'pendente'> = {
      RECEIVED: 'pago', CONFIRMED: 'pago',
      OVERDUE: 'expirado', REFUNDED: 'estornado', PENDING: 'pendente',
    }
    return map[data.status] ?? 'pendente'
  }
}

// ==========================================================================
// Factory
// ==========================================================================

export type GatewayName = 'mercadopago' | 'asaas'

export function createGateway(name: GatewayName, credentials: { accessToken?: string; apiKey?: string }): PaymentGateway {
  switch (name) {
    case 'mercadopago':
      if (!credentials.accessToken) throw new Error('MercadoPago access_token requerido')
      return new MercadoPagoGateway(credentials.accessToken)
    case 'asaas':
      if (!credentials.apiKey) throw new Error('Asaas api_key requerido')
      return new AsaasGateway(credentials.apiKey)
    default:
      throw new Error(`Gateway desconhecido: ${name}`)
  }
}
