import { Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './contacts.service'
import { AuthRequest } from '../../shared/types'

const createSchema = z.object({
  name: z.string().optional(),
  phone: z.string().min(8),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  tags: z.array(z.string().uuid()).optional(),
})

const updateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  status: z.enum(['novo', 'em_atendimento', 'orcamento', 'agendado', 'concluido', 'perdido']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

const tagSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
})

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.listContacts(req.auth.workspaceId, req.query as never)
    res.json(result)
  } catch (err) { next(err) }
}

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSchema.parse(req.body)
    const contact = await service.createContact(req.auth.workspaceId, dto)
    res.status(201).json(contact)
  } catch (err) { next(err) }
}

export async function get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await service.getContact(req.auth.workspaceId, req.params.id)
    res.json(contact)
  } catch (err) { next(err) }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = updateSchema.parse(req.body)
    const contact = await service.updateContact(req.auth.workspaceId, req.params.id, dto)
    res.json(contact)
  } catch (err) { next(err) }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteContact(req.auth.workspaceId, req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = z.object({
      status: z.enum(['novo', 'em_atendimento', 'orcamento', 'agendado', 'concluido', 'perdido']),
    }).parse(req.body)
    const contact = await service.updateContactStatus(req.auth.workspaceId, req.params.id, status)
    res.json(contact)
  } catch (err) { next(err) }
}

// Tags
export async function listTags(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const tags = await service.listTags(req.auth.workspaceId)
    res.json(tags)
  } catch (err) { next(err) }
}

export async function createTag(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, color } = tagSchema.parse(req.body)
    const tag = await service.createTag(req.auth.workspaceId, name, color)
    res.status(201).json(tag)
  } catch (err) { next(err) }
}

export async function attachTags(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tagIds } = z.object({ tagIds: z.array(z.string().uuid()) }).parse(req.body)
    await service.attachTags(req.auth.workspaceId, req.params.id, tagIds)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function detachTag(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.detachTag(req.params.id, req.params.tagId)
    res.json({ ok: true })
  } catch (err) { next(err) }
}
