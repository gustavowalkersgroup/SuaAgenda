import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './whatsapp.service'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'
import { logger } from '../../config/logger'

const router = Router()
const auth = authenticate as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

// Webhook público (sem auth) — chamado pela Evolution API
router.post('/webhook/:instance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = {
      event: req.body.event,
      instance: req.params.instance,
      data: req.body.data,
    }
    logger.debug('Webhook received', { event: payload.event, instance: payload.instance })
    await service.handleWebhook(payload)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Rotas autenticadas
router.get('/numbers', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const numbers = await service.listNumbers(req.auth.workspaceId)
    res.json(numbers)
  } catch (err) { next(err) }
}))

router.post('/numbers', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dto = z.object({
      instanceName: z.string().min(3),
      phoneNumber: z.string().min(8),
      displayName: z.string().optional(),
      purpose: z.enum(['atendimento', 'marketing']).optional(),
    }).parse(req.body)
    const id = await service.addNumber(req.auth.workspaceId, dto)
    res.status(201).json({ id })
  } catch (err) { next(err) }
}))

router.post('/numbers/:id/connect', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await service.connectNumber(req.auth.workspaceId, req.params.id)
    res.json(result)
  } catch (err) { next(err) }
}))

router.post('/numbers/:id/reset', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await service.resetInstance(req.auth.workspaceId, req.params.id)
    res.json(result)
  } catch (err) { next(err) }
}))

router.get('/numbers/:id/qrcode', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await service.getQrCode(req.auth.workspaceId, req.params.id)
    res.json(result)
  } catch (err) { next(err) }
}))

router.post('/send', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { conversationId, text } = z.object({
      conversationId: z.string().uuid(),
      text: z.string().min(1),
    }).parse(req.body)
    await service.sendMessage(req.auth.workspaceId, conversationId, text, req.auth.userId)
    res.json({ ok: true })
  } catch (err) { next(err) }
}))

export default router
