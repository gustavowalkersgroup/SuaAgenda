import { Request, Response, NextFunction } from 'express'
import { AppError } from '../shared/errors'
import { logger } from '../config/logger'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    })
    return
  }

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  })

  res.status(500).json({
    error: {
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    },
  })
}
