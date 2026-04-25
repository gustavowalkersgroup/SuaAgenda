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
    const { is_active } = z.object({ is_active: z.boolean() }).parse(req.body)
    const workspace = await adminService.updateWorkspaceStatus(req.params.id, is_active)
    res.json(workspace)
  } catch (err) {
    next(err)
  }
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
