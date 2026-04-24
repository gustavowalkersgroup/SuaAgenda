import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './automations.service'
import { authenticate, requireRole } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const marketing = requireRole('admin', 'super_admin', 'marketing') as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

const schema = z.object({
  name: z.string().min(2),
  triggerType: z.enum([
    'appointment_confirmed', 'appointment_completed', 'appointment_cancelled',
    'contact_inactive', 'birthday', 'custom',
  ]),
  triggerValue: z.number().int().min(1).optional(),
  delayHours: z.number().int().min(0).default(0),
  messages: z.array(z.object({ text: z.string().min(1) })).min(1).max(4),
  numberId: z.string().uuid().optional(),
  sendFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sendUntil: z.string().regex(/^\d{2}:\d{2}$/).optional(),
})

router.get('/', auth, marketing, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await service.listAutomations(req.auth.workspaceId, req.query as never)) }
  catch (err) { next(err) }
}))

router.post('/', auth, marketing, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.status(201).json(await service.createAutomation(req.auth.workspaceId, schema.parse(req.body))) }
  catch (err) { next(err) }
}))

router.get('/:id', auth, marketing, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await service.getAutomation(req.auth.workspaceId, req.params.id)) }
  catch (err) { next(err) }
}))

router.put('/:id', auth, marketing, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dto = schema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body)
    res.json(await service.updateAutomation(req.auth.workspaceId, req.params.id, dto))
  } catch (err) { next(err) }
}))

router.delete('/:id', auth, marketing, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await service.deleteAutomation(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}))

export default router
