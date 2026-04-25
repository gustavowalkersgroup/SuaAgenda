import jwt from 'jsonwebtoken'
import { query } from '../../db/client'
import { env } from '../../config/env'
import { AuthPayload, UserRole } from '../../shared/types'
import { ForbiddenError, NotFoundError } from '../../shared/errors'

export async function checkSuperAdmin(userId: string): Promise<void> {
  const result = await query<{ is_super_admin: boolean }>(
    `SELECT is_super_admin FROM users WHERE id = $1`,
    [userId]
  )
  if (!result.rowCount || !result.rows[0].is_super_admin) {
    throw new ForbiddenError('Acesso restrito ao super-admin')
  }
}

export async function listAllWorkspaces() {
  const result = await query<{
    id: string
    name: string
    slug: string
    plan: string
    is_active: boolean
    created_at: string
    member_count: number
    owner_name: string | null
    owner_email: string | null
  }>(
    `SELECT
       w.id, w.name, w.slug, w.plan, w.is_active, w.created_at,
       COUNT(wu.user_id)::int AS member_count,
       u.name  AS owner_name,
       u.email AS owner_email
     FROM workspaces w
     LEFT JOIN workspace_users wu ON wu.workspace_id = w.id AND wu.is_active = true
     LEFT JOIN workspace_users wu_admin ON wu_admin.workspace_id = w.id AND wu_admin.role = 'admin'
     LEFT JOIN users u ON u.id = wu_admin.user_id
     GROUP BY w.id, u.name, u.email
     ORDER BY w.created_at DESC`,
    []
  )
  return result.rows
}

export async function enterWorkspace(superAdminUserId: string, workspaceId: string) {
  const wsResult = await query<{ id: string; name: string }>(
    `SELECT id, name FROM workspaces WHERE id = $1`,
    [workspaceId]
  )
  if (!wsResult.rowCount) throw new NotFoundError('Workspace')

  const memberResult = await query<{ role: UserRole }>(
    `SELECT role FROM workspace_users WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, superAdminUserId]
  )
  const role: UserRole = memberResult.rowCount ? memberResult.rows[0].role : 'admin'

  const payload: AuthPayload = { userId: superAdminUserId, workspaceId, role }
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })

  return { token, workspaceId, workspaceName: wsResult.rows[0].name, role }
}

export async function updateWorkspaceStatus(workspaceId: string, is_active: boolean) {
  const result = await query<{ id: string; name: string; is_active: boolean }>(
    `UPDATE workspaces SET is_active = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, name, is_active`,
    [is_active, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Workspace')
  return result.rows[0]
}

export async function promoteToSuperAdmin(email: string) {
  const result = await query<{ id: string; name: string; email: string }>(
    `UPDATE users SET is_super_admin = true WHERE email = $1
     RETURNING id, name, email`,
    [email]
  )
  if (!result.rowCount) throw new NotFoundError('Usuário')
  return result.rows[0]
}
