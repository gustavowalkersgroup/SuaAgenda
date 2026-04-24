import { Router } from 'express'
import * as c from './appointments.controller'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

router.get('/availability', auth, a(c.search))
router.get('/', auth, a(c.list))
router.post('/', auth, a(c.create))
router.get('/:id', auth, a(c.get))
router.patch('/:id/confirm', auth, a(c.confirm))
router.patch('/:id/cancel', auth, a(c.cancel))
router.post('/:id/reschedule', auth, a(c.reschedule))

export default router
