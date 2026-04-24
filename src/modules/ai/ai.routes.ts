import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getAiConfig, updateAiConfig } from './ai.config.service'
import { authenticate, requireRole } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const admin = requireRole('admin', 'super_admin') as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

const updateSchema = z.object({
  model: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']).optional(),
  systemPrompt: z.string().min(10).optional(),
  persona: z.string().max(100).optional(),
  faq: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(100).max(4096).optional(),
  isActive: z.boolean().optional(),
})

router.get(
  '/config',
  auth,
  a(async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const config = await getAiConfig(req.auth.workspaceId)
      res.json(config)
    } catch (err) { next(err) }
  })
)

router.put(
  '/config',
  auth,
  admin,
  a(async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const dto = updateSchema.parse(req.body)
      const config = await updateAiConfig(req.auth.workspaceId, dto)
      res.json(config)
    } catch (err) { next(err) }
  })
)

export default router
