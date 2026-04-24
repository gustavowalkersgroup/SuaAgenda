import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './workspaces.service'
import { AuthRequest } from '../../shared/types'

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  plan: z.enum(['starter', 'pro', 'enterprise']).optional(),
})

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  openai_api_key: z.string().optional(),
  parallel_scheduling: z.boolean().optional(),
  scheduling_window_days: z.number().int().min(1).max(60).optional(),
  slot_lock_minutes: z.number().int().min(5).max(60).optional(),
})

const inviteSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'atendente', 'marketing']),
})

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSchema.parse(req.body)
    const workspace = await service.createWorkspace(req.auth.userId, dto)
    res.status(201).json(workspace)
  } catch (err) { next(err) }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspace = await service.getWorkspace(req.auth.workspaceId)
    res.json(workspace)
  } catch (err) { next(err) }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = updateSchema.parse(req.body)
    const workspace = await service.updateWorkspace(req.auth.workspaceId, dto)
    res.json(workspace)
  } catch (err) { next(err) }
}

export async function members(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.getWorkspaceMembers(req.auth.workspaceId, req.query as Record<string, unknown>)
    res.json(result)
  } catch (err) { next(err) }
}

export async function invite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = inviteSchema.parse(req.body)
    await service.inviteMember(req.auth.workspaceId, dto.userId, dto.role)
    res.status(201).json({ ok: true })
  } catch (err) { next(err) }
}

export async function removeMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.removeMember(req.auth.workspaceId, req.params.userId)
    res.json({ ok: true })
  } catch (err) { next(err) }
}
