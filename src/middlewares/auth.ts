import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { AuthPayload, AuthRequest, UserRole } from '../shared/types'
import { UnauthorizedError, ForbiddenError } from '../shared/errors'

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token não fornecido'))
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload
    req.auth = payload
    next()
  } catch {
    next(new UnauthorizedError('Token inválido ou expirado'))
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.auth.role)) {
      return next(new ForbiddenError('Permissão insuficiente'))
    }
    next()
  }
}

export function requireWorkspace(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.auth.workspaceId) {
    return next(new UnauthorizedError('Workspace não identificado'))
  }
  next()
}
