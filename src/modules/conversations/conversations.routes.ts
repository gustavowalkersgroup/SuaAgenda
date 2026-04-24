import { Router } from 'express'
import * as controller from './conversations.controller'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

router.get('/', auth, a(controller.list))
router.get('/:id', auth, a(controller.get))
router.patch('/:id/assign', auth, a(controller.assign))
router.patch('/:id/close', auth, a(controller.close))
router.patch('/:id/read', auth, a(controller.markRead))
router.get('/:id/messages', auth, a(controller.messages))

export default router
