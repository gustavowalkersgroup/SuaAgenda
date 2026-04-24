import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './waitlist.service'
import { AuthRequest } from '../../shared/types'

const joinSchema = z.object({
  contactId: z.string().uuid(),
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid().optional(),
  preferredFrom: z.string().datetime().optional(),
  preferredTo: z.string().datetime().optional(),
})

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await service.listWaitlist(req.auth.workspaceId, req.query as never))
  } catch (err) { next(err) }
}

export async function join(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = joinSchema.parse(req.body)
    const entry = await service.joinWaitlist(req.auth.workspaceId, dto.contactId, dto)
    res.status(201).json(entry)
  } catch (err) { next(err) }
}

export async function leave(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.leaveWaitlist(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}
