import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as authService from './auth.service'
import { AuthRequest } from '../../shared/types'

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  workspaceSlug: z.string().optional(),
})

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = registerSchema.parse(req.body)
    const result = await authService.register(dto)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = loginSchema.parse(req.body)
    const result = await authService.login(dto)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaces = await authService.getUserWorkspaces(req.auth.userId)
    res.json({ auth: req.auth, workspaces })
  } catch (err) {
    next(err)
  }
}
