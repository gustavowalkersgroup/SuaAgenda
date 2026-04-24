import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './professionals.service'
import { AuthRequest } from '../../shared/types'

const dayScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
})

const createSchema = z.object({
  name: z.string().min(2),
  userId: z.string().uuid().optional(),
  phone: z.string().optional(),
  schedule: z.array(dayScheduleSchema).optional(),
})

const blockSchema = z.object({
  blockType: z.enum(['folga', 'compromisso', 'almoco_fixo', 'almoco_dinamico']),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().optional(),
  lunchDurationMinutes: z.number().int().min(15).max(180).optional(),
})

const w = (workspaceId: string) => workspaceId

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await service.listProfessionals(req.auth.workspaceId, req.query as never))
  } catch (err) { next(err) }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSchema.parse(req.body)
    res.status(201).json(await service.createProfessional(req.auth.workspaceId, dto))
  } catch (err) { next(err) }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await service.getProfessional(req.auth.workspaceId, req.params.id))
  } catch (err) { next(err) }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body)
    res.json(await service.updateProfessional(req.auth.workspaceId, req.params.id, dto))
  } catch (err) { next(err) }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteProfessional(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function createBlock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = blockSchema.parse(req.body)
    const id = await service.createBlock(req.auth.workspaceId, req.params.id, dto)
    res.status(201).json({ id })
  } catch (err) { next(err) }
}

export async function listBlocks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).parse(req.query)
    res.json(await service.listBlocks(req.auth.workspaceId, req.params.id, from, to))
  } catch (err) { next(err) }
}

export async function deleteBlock(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteBlock(req.auth.workspaceId, req.params.blockId)
    res.json({ ok: true })
  } catch (err) { next(err) }
}
