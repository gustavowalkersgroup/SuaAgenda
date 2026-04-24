import { query, withTransaction } from '../../db/client'
import { ConflictError, NotFoundError, ForbiddenError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'
import crypto from 'crypto'
import { env } from '../../config/env'

interface CreateWorkspaceDTO {
  name: string
  slug?: string
  plan?: string
}

interface UpdateWorkspaceDTO {
  name?: string
  openai_api_key?: string
  parallel_scheduling?: boolean
  scheduling_window_days?: number
  slot_lock_minutes?: number
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function encryptApiKey(key: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(env.ENCRYPTION_KEY),
    iv
  )
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptApiKey(encrypted: string): string {
  const [ivHex, dataHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(env.ENCRYPTION_KEY),
    iv
  )
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export async function createWorkspace(userId: string, dto: CreateWorkspaceDTO) {
  const slug = dto.slug || slugify(dto.name)

  const existing = await query('SELECT id FROM workspaces WHERE slug = $1', [slug])
  if (existing.rowCount) throw new ConflictError('Slug já em uso')

  return withTransaction(async (client) => {
    const wsResult = await client.query<{ id: string; name: string; slug: string }>(
      `INSERT INTO workspaces (name, slug, plan)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug`,
      [dto.name, slug, dto.plan || 'starter']
    )
    const workspace = wsResult.rows[0]

    await client.query(
      `INSERT INTO workspace_users (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspace.id, userId]
    )

    return workspace
  })
}

export async function getWorkspace(workspaceId: string) {
  const result = await query<{
    id: string
    name: string
    slug: string
    plan: string
    parallel_scheduling: boolean
    scheduling_window_days: number
    slot_lock_minutes: number
    max_contacts: number
    max_users: number
    is_active: boolean
    created_at: string
  }>(
    `SELECT id, name, slug, plan, parallel_scheduling, scheduling_window_days,
            slot_lock_minutes, max_contacts, max_users, is_active, created_at
     FROM workspaces WHERE id = $1`,
    [workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Workspace')
  return result.rows[0]
}

export async function updateWorkspace(workspaceId: string, dto: UpdateWorkspaceDTO) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (dto.name !== undefined) { fields.push(`name = $${i++}`); values.push(dto.name) }
  if (dto.parallel_scheduling !== undefined) { fields.push(`parallel_scheduling = $${i++}`); values.push(dto.parallel_scheduling) }
  if (dto.scheduling_window_days !== undefined) { fields.push(`scheduling_window_days = $${i++}`); values.push(dto.scheduling_window_days) }
  if (dto.slot_lock_minutes !== undefined) { fields.push(`slot_lock_minutes = $${i++}`); values.push(dto.slot_lock_minutes) }
  if (dto.openai_api_key !== undefined) {
    fields.push(`openai_api_key = $${i++}`)
    values.push(encryptApiKey(dto.openai_api_key))
  }

  if (!fields.length) return getWorkspace(workspaceId)

  values.push(workspaceId)
  const result = await query(
    `UPDATE workspaces SET ${fields.join(', ')} WHERE id = $${i} RETURNING id`,
    values
  )
  if (!result.rowCount) throw new NotFoundError('Workspace')
  return getWorkspace(workspaceId)
}

export async function getWorkspaceMembers(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)

  const [rows, count] = await Promise.all([
    query<{ id: string; name: string; email: string; role: string; is_active: boolean }>(
      `SELECT u.id, u.name, u.email, wu.role, wu.is_active
       FROM workspace_users wu
       JOIN users u ON u.id = wu.user_id
       WHERE wu.workspace_id = $1
       ORDER BY u.name
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) FROM workspace_users WHERE workspace_id = $1',
      [workspaceId]
    ),
  ])

  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function inviteMember(workspaceId: string, userId: string, role: string) {
  const existing = await query(
    'SELECT id FROM workspace_users WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  )
  if (existing.rowCount) throw new ConflictError('Usuário já é membro')

  const wsResult = await query<{ max_users: number }>(
    'SELECT max_users FROM workspaces WHERE id = $1',
    [workspaceId]
  )
  const currentCount = await query<{ count: string }>(
    'SELECT COUNT(*) FROM workspace_users WHERE workspace_id = $1 AND is_active = true',
    [workspaceId]
  )

  if (Number(currentCount.rows[0].count) >= wsResult.rows[0].max_users) {
    throw new ForbiddenError('Limite de usuários do plano atingido')
  }

  await query(
    `INSERT INTO workspace_users (workspace_id, user_id, role) VALUES ($1, $2, $3)`,
    [workspaceId, userId, role]
  )
}

export async function removeMember(workspaceId: string, userId: string) {
  await query(
    `UPDATE workspace_users SET is_active = false
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  )
}

export { decryptApiKey }
