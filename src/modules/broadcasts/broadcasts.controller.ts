import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './broadcasts.service'
import { AuthRequest } from '../../shared/types'

const messageSchema = z.object({ text: z.string().min(1) })

const segmentSchema = z.object({
  tagIds: z.array(z.string().uuid()).optional(),
  statuses: z.array(z.enum(['novo', 'em_atendimento', 'orcamento', 'agendado', 'concluido', 'perdido'])).optional(),
  inactiveDays: z.number().int().min(1).optional(),
})

const createSchema = z.object({
  name: z.string().min(2),
  numberId: z.string().uuid(),
  messages: z.array(messageSchema).min(1).max(4),
  speed: z.union([z.literal(1), z.literal(5), z.literal(10)]).default(1),
  segment: segmentSchema,
  scheduledAt: z.string().datetime().optional(),
})

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await service.listBroadcasts(req.auth.workspaceId, req.query as never)) }
  catch (err) { next(err) }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSchema.parse(req.body)
    res.status(201).json(await service.createBroadcast(req.auth.workspaceId, dto))
  } catch (err) { next(err) }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try { res.json(await service.getBroadcast(req.auth.workspaceId, req.params.id)) }
  catch (err) { next(err) }
}

export async function start(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.startBroadcast(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.cancelBroadcast(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteBroadcast(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}
