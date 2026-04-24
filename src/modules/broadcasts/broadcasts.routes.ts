import { Router } from 'express'
import * as c from './broadcasts.controller'
import { authenticate, requireRole } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const marketing = requireRole('admin', 'super_admin', 'marketing') as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

router.get('/', auth, marketing, a(c.list))
router.post('/', auth, marketing, a(c.create))
router.get('/:id', auth, marketing, a(c.get))
router.post('/:id/start', auth, marketing, a(c.start))
router.post('/:id/cancel', auth, marketing, a(c.cancel))
router.delete('/:id', auth, marketing, a(c.remove))

export default router
