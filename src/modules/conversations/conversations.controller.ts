import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './conversations.service'
import { AuthRequest } from '../../shared/types'

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.listConversations(req.auth.workspaceId, req.query as never)
    res.json(result)
  } catch (err) { next(err) }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const conv = await service.getConversation(req.auth.workspaceId, req.params.id)
    res.json(conv)
  } catch (err) { next(err) }
}

export async function assign(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assignedTo, assigneeType } = z.object({
      assignedTo: z.string().uuid().nullable().optional(),
      assigneeType: z.enum(['ia', 'humano']),
    }).parse(req.body)
    const conv = await service.assignConversation(
      req.auth.workspaceId,
      req.params.id,
      assignedTo ?? null,
      assigneeType
    )
    res.json(conv)
  } catch (err) { next(err) }
}

export async function close(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.closeConversation(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function markRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.markAsRead(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function messages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.getMessages(req.auth.workspaceId, req.params.id, req.query as never)
    res.json(result)
  } catch (err) { next(err) }
}
