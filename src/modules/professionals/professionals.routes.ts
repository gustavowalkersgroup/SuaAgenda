import { Router } from 'express'
import * as c from './professionals.controller'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

router.get('/', auth, a(c.list))
router.post('/', auth, a(c.create))
router.get('/:id', auth, a(c.get))
router.put('/:id', auth, a(c.update))
router.delete('/:id', auth, a(c.remove))
router.get('/:id/schedules', auth, a(c.getSchedules))
router.put('/:id/schedules', auth, a(c.updateSchedules))
router.get('/:id/blocks', auth, a(c.listBlocks))
router.post('/:id/blocks', auth, a(c.createBlock))
router.delete('/:id/blocks/:blockId', auth, a(c.deleteBlock))

export default router
