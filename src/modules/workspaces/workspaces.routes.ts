import { Router } from 'express'
import * as controller from './workspaces.controller'
import { authenticate, requireRole } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const asAuth = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

router.post('/', auth, asAuth(controller.create))
router.get('/current', auth, asAuth(controller.get))
router.put('/current', auth, requireRole('admin', 'super_admin') as never, asAuth(controller.update))
router.get('/current/members', auth, asAuth(controller.members))
router.post('/current/members', auth, requireRole('admin', 'super_admin') as never, asAuth(controller.invite))
router.delete('/current/members/:userId', auth, requireRole('admin', 'super_admin') as never, asAuth(controller.removeMember))

export default router
