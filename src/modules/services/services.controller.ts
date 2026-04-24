import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './services.service'
import { AuthRequest } from '../../shared/types'

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  durationMinutes: z.number().int().min(30).multipleOf(30),
  price: z.number().min(0),
  depositPercent: z.number().min(0).max(100).optional(),
  professionalIds: z.array(z.string().uuid()).optional(),
})

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await service.listServices(req.auth.workspaceId, req.query as never)) }
  catch (err) { next(err) }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(201).json(await service.createService(req.auth.workspaceId, schema.parse(req.body)))
  } catch (err) { next(err) }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await service.getService(req.auth.workspaceId, req.params.id)) }
  catch (err) { next(err) }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = schema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body)
    res.json(await service.updateService(req.auth.workspaceId, req.params.id, dto))
  } catch (err) { next(err) }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteService(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}
