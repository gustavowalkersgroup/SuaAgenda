import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getNotificationConfig, updateNotificationConfig } from './notifications.service'
import { authenticate, requireRole } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const admin = requireRole('admin', 'super_admin') as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

const updateSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  reminderHoursBefore: z.array(z.number().int().min(1).max(168)).max(5).optional(),
  reminderSendFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reminderSendUntil: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  paymentConfirmEnabled: z.boolean().optional(),
  paymentConfirmMessage: z.string().min(10).optional(),
  noshowEnabled: z.boolean().optional(),
  noshowGraceMinutes: z.number().int().min(0).max(120).optional(),
})

router.get('/', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try { res.json(await getNotificationConfig(req.auth.workspaceId)) }
  catch (err) { next(err) }
}))

router.put('/', auth, admin, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dto = updateSchema.parse(req.body)
    res.json(await updateNotificationConfig(req.auth.workspaceId, dto))
  } catch (err) { next(err) }
}))

export default router
