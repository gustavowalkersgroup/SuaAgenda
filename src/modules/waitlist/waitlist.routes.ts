import { Router } from 'express'
import * as c from './waitlist.controller'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

router.get('/', auth, a(c.list))
router.post('/', auth, a(c.join))
router.delete('/:id', auth, a(c.leave))

export default router
