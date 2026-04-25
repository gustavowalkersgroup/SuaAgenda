import { Router } from 'express'
import { authenticate } from '../../middlewares/auth'
import * as controller from './admin.controller'
import { AuthRequest } from '../../shared/types'

const router = Router()

router.use(authenticate as never)

router.get('/workspaces',            (req, res, next) => controller.listWorkspaces(req as AuthRequest, res, next))
router.post('/workspaces/:id/enter', (req, res, next) => controller.enterWorkspace(req as unknown as AuthRequest, res, next))
router.patch('/workspaces/:id',      (req, res, next) => controller.toggleWorkspace(req as unknown as AuthRequest, res, next))
router.post('/promote',              (req, res, next) => controller.promote(req as AuthRequest, res, next))

export default router
