import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './payments.service'
import { AuthRequest } from '../../shared/types'
import { logger } from '../../config/logger'

// ==========================================================================
// Rotas autenticadas
// ==========================================================================

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await service.listPayments(req.auth.workspaceId, req.query as never))
  } catch (err) { next(err) }
}

export async function createLink(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appointmentId } = z.object({ appointmentId: z.string().uuid() }).parse(req.body)
    const checkoutUrl = await service.createPaymentLink(req.auth.workspaceId, appointmentId)
    res.json({ checkoutUrl })
  } catch (err) { next(err) }
}

export async function checkPolicy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const policy = await service.checkCancellationPolicy(req.auth.workspaceId, req.params.appointmentId)
    res.json(policy)
  } catch (err) { next(err) }
}

export async function getGatewayStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.getGatewayStatus(req.auth.workspaceId)
    res.json(result)
  } catch (err) { next(err) }
}

export async function configureGateway(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = z.object({
      provider:      z.enum(['mercadopago', 'asaas']),
      accessToken:   z.string().optional(),
      apiKey:        z.string().optional(),
      webhookSecret: z.string().optional(),
      publicKey:     z.string().optional(),
      clientId:      z.string().optional(),
      clientSecret:  z.string().optional(),
    }).parse(req.body)

    await service.saveGatewayConfig(req.auth.workspaceId, dto.provider, {
      accessToken:   dto.accessToken,
      apiKey:        dto.apiKey,
      webhookSecret: dto.webhookSecret,
      publicKey:     dto.publicKey,
      clientId:      dto.clientId,
      clientSecret:  dto.clientSecret,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ==========================================================================
// Webhook público (chamado pelo gateway de pagamento)
// ==========================================================================

export async function webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Responde imediatamente ao gateway (gateways exigem resposta rápida)
  res.json({ ok: true })

  try {
    const { provider, workspaceId } = req.params
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, String(v)])
    )

    await service.handlePaymentWebhook(provider, workspaceId, req.body, headers)
  } catch (err) {
    logger.error('Payment webhook processing error', { error: (err as Error).message })
  }
}
