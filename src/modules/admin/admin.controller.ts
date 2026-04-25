import { Response, NextFunction } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../../shared/types'
import * as adminService from './admin.service'

export async function listWorkspaces(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    const workspaces = await adminService.listAllWorkspaces()
    res.json({ workspaces })
  } catch (err) {
    next(err)
  }
}

export async function enterWorkspace(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    const result = await adminService.enterWorkspace(req.auth.userId, req.params.id)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function toggleWorkspace(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    const dto = z.object({
      is_active:     z.boolean().optional(),
      plan:          z.enum(['starter', 'pro', 'enterprise', 'trial']).optional(),
      trial_ends_at: z.string().nullable().optional(),
      max_contacts:  z.number().int().min(1).optional(),
      max_users:     z.number().int().min(1).optional(),
      billing_email: z.string().email().optional(),
      notes:         z.string().optional(),
    }).parse(req.body)
    const workspace = await adminService.updateWorkspaceAdmin(req.params.id, dto)
    res.json(workspace)
  } catch (err) {
    next(err)
  }
}

export async function getWorkspaceDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    const [detail, members] = await Promise.all([
      adminService.getWorkspaceAdminDetail(req.params.id),
      adminService.getWorkspaceMembers(req.params.id),
    ])
    res.json({ ...detail, members })
  } catch (err) { next(err) }
}

export async function deleteWorkspace(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    await adminService.deleteWorkspace(req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function exportWorkspace(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    const config = await adminService.exportWorkspaceConfig(req.params.id)
    res.json(config)
  } catch (err) { next(err) }
}

export async function removeMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    await adminService.removeMemberAdmin(req.params.id, req.params.userId)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

export async function promote(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.checkSuperAdmin(req.auth.userId)
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const user = await adminService.promoteToSuperAdmin(email)
    res.json(user)
  } catch (err) {
    next(err)
  }
}
