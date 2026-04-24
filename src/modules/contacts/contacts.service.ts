import { query } from '../../db/client'
import { NotFoundError, ConflictError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'
import { ContactStatus } from '../../shared/types'

interface CreateContactDTO {
  name?: string
  phone: string
  email?: string
  notes?: string
  assigned_to?: string
  tags?: string[]
}

interface UpdateContactDTO {
  name?: string
  email?: string
  notes?: string
  status?: ContactStatus
  assigned_to?: string | null
}

interface ContactFilters {
  status?: ContactStatus
  assigned_to?: string
  tag?: string
  search?: string
  page?: number
  limit?: number
}

export async function createContact(workspaceId: string, dto: CreateContactDTO) {
  const existing = await query(
    'SELECT id FROM contacts WHERE workspace_id = $1 AND phone = $2',
    [workspaceId, dto.phone]
  )
  if (existing.rowCount) throw new ConflictError('Contato com esse telefone já existe')

  const result = await query<{ id: string }>(
    `INSERT INTO contacts (workspace_id, name, phone, email, notes, assigned_to)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [workspaceId, dto.name || null, dto.phone, dto.email || null, dto.notes || null, dto.assigned_to || null]
  )
  const contactId = result.rows[0].id

  if (dto.tags?.length) {
    await attachTags(workspaceId, contactId, dto.tags)
  }

  return getContact(workspaceId, contactId)
}

export async function getContact(workspaceId: string, contactId: string) {
  const result = await query<{
    id: string
    name: string
    phone: string
    email: string
    status: ContactStatus
    notes: string
    assigned_to: string
    assigned_name: string
    created_at: string
    tags: Array<{ id: string; name: string; color: string }>
  }>(
    `SELECT
       c.id, c.name, c.phone, c.email, c.status, c.notes,
       c.assigned_to, u.name as assigned_name, c.created_at,
       COALESCE(
         json_agg(
           json_build_object('id', t.id, 'name', t.name, 'color', t.color)
         ) FILTER (WHERE t.id IS NOT NULL),
         '[]'
       ) as tags
     FROM contacts c
     LEFT JOIN users u ON u.id = c.assigned_to
     LEFT JOIN contact_tags ct ON ct.contact_id = c.id
     LEFT JOIN tags t ON t.id = ct.tag_id
     WHERE c.id = $1 AND c.workspace_id = $2
     GROUP BY c.id, u.name`,
    [contactId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Contato')
  return result.rows[0]
}

export async function listContacts(workspaceId: string, filters: ContactFilters) {
  const { limit, offset, page } = getPaginationParams(filters)
  const conditions: string[] = ['c.workspace_id = $1']
  const values: unknown[] = [workspaceId]
  let i = 2

  if (filters.status) { conditions.push(`c.status = $${i++}`); values.push(filters.status) }
  if (filters.assigned_to) { conditions.push(`c.assigned_to = $${i++}`); values.push(filters.assigned_to) }
  if (filters.search) {
    conditions.push(`(c.name ILIKE $${i} OR c.phone ILIKE $${i} OR c.email ILIKE $${i})`)
    values.push(`%${filters.search}%`)
    i++
  }
  if (filters.tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM contact_tags ct2
      JOIN tags t2 ON t2.id = ct2.tag_id
      WHERE ct2.contact_id = c.id AND t2.name = $${i++}
    )`)
    values.push(filters.tag)
  }

  const where = conditions.join(' AND ')

  const [rows, count] = await Promise.all([
    query(
      `SELECT c.id, c.name, c.phone, c.email, c.status, c.assigned_to,
              u.name as assigned_name, c.created_at,
              COALESCE(
                json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
                FILTER (WHERE t.id IS NOT NULL), '[]'
              ) as tags
       FROM contacts c
       LEFT JOIN users u ON u.id = c.assigned_to
       LEFT JOIN contact_tags ct ON ct.contact_id = c.id
       LEFT JOIN tags t ON t.id = ct.tag_id
       WHERE ${where}
       GROUP BY c.id, u.name
       ORDER BY c.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(DISTINCT c.id) FROM contacts c WHERE ${where}`,
      values
    ),
  ])

  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function updateContact(workspaceId: string, contactId: string, dto: UpdateContactDTO) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (dto.name !== undefined) { fields.push(`name = $${i++}`); values.push(dto.name) }
  if (dto.email !== undefined) { fields.push(`email = $${i++}`); values.push(dto.email) }
  if (dto.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(dto.notes) }
  if (dto.status !== undefined) { fields.push(`status = $${i++}`); values.push(dto.status) }
  if (dto.assigned_to !== undefined) { fields.push(`assigned_to = $${i++}`); values.push(dto.assigned_to) }

  if (!fields.length) return getContact(workspaceId, contactId)

  values.push(workspaceId, contactId)
  const result = await query(
    `UPDATE contacts SET ${fields.join(', ')}
     WHERE workspace_id = $${i++} AND id = $${i++}`,
    values
  )
  if (!result.rowCount) throw new NotFoundError('Contato')
  return getContact(workspaceId, contactId)
}

export async function updateContactStatus(workspaceId: string, contactId: string, status: ContactStatus) {
  return updateContact(workspaceId, contactId, { status })
}

export async function deleteContact(workspaceId: string, contactId: string) {
  const result = await query(
    'DELETE FROM contacts WHERE workspace_id = $1 AND id = $2',
    [workspaceId, contactId]
  )
  if (!result.rowCount) throw new NotFoundError('Contato')
}

// Tags
export async function createTag(workspaceId: string, name: string, color: string) {
  const result = await query<{ id: string; name: string; color: string }>(
    `INSERT INTO tags (workspace_id, name, color) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, name) DO NOTHING
     RETURNING id, name, color`,
    [workspaceId, name, color]
  )
  if (!result.rowCount) throw new ConflictError('Tag já existe')
  return result.rows[0]
}

export async function listTags(workspaceId: string) {
  const result = await query<{ id: string; name: string; color: string }>(
    'SELECT id, name, color FROM tags WHERE workspace_id = $1 ORDER BY name',
    [workspaceId]
  )
  return result.rows
}

export async function attachTags(workspaceId: string, contactId: string, tagIds: string[]) {
  const existing = await query(
    'SELECT id FROM contacts WHERE workspace_id = $1 AND id = $2',
    [workspaceId, contactId]
  )
  if (!existing.rowCount) throw new NotFoundError('Contato')

  for (const tagId of tagIds) {
    await query(
      `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [contactId, tagId]
    )
  }
}

export async function detachTag(contactId: string, tagId: string) {
  await query('DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2', [contactId, tagId])
}

export async function findOrCreateContact(workspaceId: string, phone: string, name?: string) {
  const existing = await query<{ id: string }>(
    'SELECT id FROM contacts WHERE workspace_id = $1 AND phone = $2',
    [workspaceId, phone]
  )
  if (existing.rowCount) return existing.rows[0].id

  const result = await query<{ id: string }>(
    `INSERT INTO contacts (workspace_id, name, phone) VALUES ($1, $2, $3) RETURNING id`,
    [workspaceId, name || phone, phone]
  )
  return result.rows[0].id
}
