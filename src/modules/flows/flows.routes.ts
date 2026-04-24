import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { listFlows, upsertFlow, deleteFlow } from '../../engine/flow.engine'
import { authenticate, requireRole } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const admin = requireRole('admin', 'super_admin') as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

const nodeSchema: z.ZodType<Record<string, unknown>> = z.object({
  id: z.string(),
  type: z.enum(['message', 'input', 'condition', 'action', 'ai', 'delay', 'typing', 'follow_up']),
  data: z.record(z.unknown()),
  next: z.string().optional(),
  nextTrue: z.string().optional(),
  nextFalse: z.string().optional(),
})

const flowSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  trigger: z.string().min(1),
  nodes: z.array(nodeSchema),
  isActive: z.boolean().optional(),
})

router.get('/', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await listFlows(req.auth.workspaceId)) }
  catch (err) { next(err) }
}))

router.post('/', auth, admin, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dto = flowSchema.parse(req.body)
    res.status(201).json(await upsertFlow(req.auth.workspaceId, dto as never))
  } catch (err) { next(err) }
}))

router.put('/:id', auth, admin, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dto = flowSchema.parse({ ...req.body, id: req.params.id })
    res.json(await upsertFlow(req.auth.workspaceId, dto as never))
  } catch (err) { next(err) }
}))

router.delete('/:id', auth, admin, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await deleteFlow(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}))

export default router
