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
    trial_ends_at: string | null
    max_contacts: number
    max_users: number
    billing_email: string | null
    notes: string | null
    timezone: string
    member_count: number
    owner_name: string | null
    owner_email: string | null
  }>(
    `SELECT
       w.id, w.name, w.slug, w.plan, w.is_active, w.created_at,
       w.trial_ends_at, w.max_contacts, w.max_users,
       w.billing_email, w.notes, w.timezone,
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

export async function updateWorkspaceAdmin(
  workspaceId: string,
  dto: Partial<{
    plan: string
    is_active: boolean
    trial_ends_at: string | null
    max_contacts: number
    max_users: number
    billing_email: string
    notes: string
  }>
) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (dto.plan !== undefined)          { fields.push(`plan = $${i++}`);          values.push(dto.plan) }
  if (dto.is_active !== undefined)     { fields.push(`is_active = $${i++}`);     values.push(dto.is_active) }
  if (dto.trial_ends_at !== undefined) { fields.push(`trial_ends_at = $${i++}`); values.push(dto.trial_ends_at) }
  if (dto.max_contacts !== undefined)  { fields.push(`max_contacts = $${i++}`);  values.push(dto.max_contacts) }
  if (dto.max_users !== undefined)     { fields.push(`max_users = $${i++}`);     values.push(dto.max_users) }
  if (dto.billing_email !== undefined) { fields.push(`billing_email = $${i++}`); values.push(dto.billing_email) }
  if (dto.notes !== undefined)         { fields.push(`notes = $${i++}`);         values.push(dto.notes) }

  if (!fields.length) return getWorkspaceAdminDetail(workspaceId)

  values.push(workspaceId)
  await query(
    `UPDATE workspaces SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
    values
  )
  return getWorkspaceAdminDetail(workspaceId)
}

export async function getWorkspaceAdminDetail(workspaceId: string) {
  const result = await query<{
    id: string; name: string; slug: string; plan: string
    is_active: boolean; created_at: string; trial_ends_at: string | null
    max_contacts: number; max_users: number
    billing_email: string | null; notes: string | null
    timezone: string
  }>(
    `SELECT id, name, slug, plan, is_active, created_at,
            trial_ends_at, max_contacts, max_users,
            billing_email, notes, timezone
     FROM workspaces WHERE id = $1`,
    [workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Workspace')
  return result.rows[0]
}

export async function deleteWorkspace(workspaceId: string) {
  // Soft-delete: marca como inativo e registra data
  const result = await query(
    `UPDATE workspaces SET is_active = false, updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Workspace')
}

export async function exportWorkspaceConfig(workspaceId: string) {
  const [ws, members, services, profs] = await Promise.all([
    query(
      `SELECT id, name, slug, plan, timezone, max_contacts, max_users, parallel_scheduling,
              scheduling_window_days, slot_lock_minutes, created_at
       FROM workspaces WHERE id = $1`,
      [workspaceId]
    ),
    query(
      `SELECT u.email, wu.role FROM workspace_users wu
       JOIN users u ON u.id = wu.user_id
       WHERE wu.workspace_id = $1 AND wu.is_active = true`,
      [workspaceId]
    ),
    query(
      `SELECT name, description, duration_minutes, price, is_active FROM services WHERE workspace_id = $1`,
      [workspaceId]
    ),
    query(
      `SELECT name, specialty, email, phone FROM professionals WHERE workspace_id = $1 AND is_active = true`,
      [workspaceId]
    ),
  ])

  return {
    exported_at: new Date().toISOString(),
    workspace: ws.rows[0] ?? null,
    members: members.rows,
    services: services.rows,
    professionals: profs.rows,
  }
}

export async function getWorkspaceMembers(workspaceId: string) {
  const result = await query<{
    user_id: string; name: string; email: string; role: string; joined_at: string
  }>(
    `SELECT wu.user_id, u.name, u.email, wu.role, wu.created_at AS joined_at
     FROM workspace_users wu
     JOIN users u ON u.id = wu.user_id
     WHERE wu.workspace_id = $1 AND wu.is_active = true
     ORDER BY wu.created_at`,
    [workspaceId]
  )
  return result.rows
}

export async function removeMemberAdmin(workspaceId: string, userId: string) {
  await query(
    `UPDATE workspace_users SET is_active = false
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  )
}
