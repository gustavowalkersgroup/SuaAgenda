import { Router } from 'express'
import * as c from './payments.controller'
import { authenticate, requireRole } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const admin = requireRole('admin', 'super_admin') as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

// Webhook público — gateway chama esta rota sem auth
router.post('/webhook/:provider/:workspaceId', c.webhook)

// Rotas autenticadas
router.get('/', auth, a(c.list))
router.post('/link', auth, a(c.createLink))
router.get('/policy/:appointmentId', auth, a(c.checkPolicy))
router.get('/gateway', auth, a(c.getGatewayStatus))
router.post('/gateway', auth, admin, a(c.configureGateway))

export default router
