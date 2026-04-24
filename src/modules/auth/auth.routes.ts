import { Router } from 'express'
import * as controller from './auth.controller'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'

const router = Router()

router.post('/register', controller.register)
router.post('/login', controller.login)
router.get('/me', authenticate as never, (req, res, next) =>
  controller.me(req as AuthRequest, res, next)
)

export default router
