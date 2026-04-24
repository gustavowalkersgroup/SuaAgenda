import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './appointments.service'
import { AuthRequest } from '../../shared/types'

const assignmentSchema = z.object({
  serviceId: z.string().uuid(),
  serviceName: z.string(),
  professionalId: z.string().uuid(),
  startAt: z.string().datetime().transform((s) => new Date(s)),
  endAt: z.string().datetime().transform((s) => new Date(s)),
})

const createSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  services: z.array(z.object({ serviceId: z.string().uuid() })).min(1).max(3),
  selectedAssignments: z.array(assignmentSchema).min(1).max(3),
  notes: z.string().optional(),
})

const searchSchema = z.object({
  serviceIds: z.string().transform((s) => s.split(',')),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export async function search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { serviceIds, from, to } = searchSchema.parse(req.query)
    const result = await service.searchAvailability({
      workspaceId: req.auth.workspaceId,
      serviceIds,
      from,
      to,
    })
    res.json(result)
  } catch (err) { next(err) }
}

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await service.listAppointments(req.auth.workspaceId, req.query as never))
  } catch (err) { next(err) }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSchema.parse(req.body)
    res.status(201).json(await service.createAppointment(req.auth.workspaceId, dto))
  } catch (err) { next(err) }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await service.getAppointment(req.auth.workspaceId, req.params.id))
  } catch (err) { next(err) }
}

export async function confirm(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await service.confirmAppointment(req.auth.workspaceId, req.params.id))
  } catch (err) { next(err) }
}

export async function cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body)
    await service.cancelAppointment(req.auth.workspaceId, req.params.id, reason)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function reschedule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSchema.omit({ contactId: true, conversationId: true }).parse(req.body)
    res.json(await service.reschedule(req.auth.workspaceId, req.params.id, dto))
  } catch (err) { next(err) }
}
