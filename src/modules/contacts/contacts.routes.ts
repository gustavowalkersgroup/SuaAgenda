import { Router } from 'express'
import * as controller from './contacts.controller'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()
const auth = authenticate as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

router.get('/', auth, a(controller.list))
router.post('/', auth, a(controller.create))
router.get('/tags', auth, a(controller.listTags))
router.post('/tags', auth, a(controller.createTag))
router.get('/:id', auth, a(controller.get))
router.put('/:id', auth, a(controller.update))
router.delete('/:id', auth, a(controller.remove))
router.patch('/:id/status', auth, a(controller.updateStatus))
router.post('/:id/tags', auth, a(controller.attachTags))
router.delete('/:id/tags/:tagId', auth, a(controller.detachTag))

export default router
