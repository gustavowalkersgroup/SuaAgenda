import { query, withTransaction } from '../../db/client'
import { NotFoundError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'

type ConversationStatus = 'aberta' | 'em_atendimento' | 'fechada' | 'aguardando'
type AssigneeType = 'ia' | 'humano'

interface ConversationFilters {
  status?: ConversationStatus
  assignee_type?: AssigneeType
  assigned_to?: string
  contact_id?: string
  page?: number
  limit?: number
}

export async function listConversations(workspaceId: string, filters: ConversationFilters) {
  const { limit, offset, page } = getPaginationParams(filters)
  const conditions: string[] = ['cv.workspace_id = $1']
  const values: unknown[] = [workspaceId]
  let i = 2

  if (filters.status) { conditions.push(`cv.status = $${i++}`); values.push(filters.status) }
  if (filters.assignee_type) { conditions.push(`cv.assignee_type = $${i++}`); values.push(filters.assignee_type) }
  if (filters.assigned_to) { conditions.push(`cv.assigned_to = $${i++}`); values.push(filters.assigned_to) }
  if (filters.contact_id) { conditions.push(`cv.contact_id = $${i++}`); values.push(filters.contact_id) }

  const where = conditions.join(' AND ')

  const [rows, count] = await Promise.all([
    query(
      `SELECT
         cv.id, cv.status, cv.assignee_type, cv.assigned_to, cv.unread_count,
         cv.last_message_at, cv.created_at,
         c.id as contact_id, c.name as contact_name, c.phone as contact_phone,
         u.name as assigned_name,
         lm.content as last_message_content, lm.direction as last_message_direction
       FROM conversations cv
       JOIN contacts c ON c.id = cv.contact_id
       LEFT JOIN users u ON u.id = cv.assigned_to
       LEFT JOIN LATERAL (
         SELECT content, direction FROM messages
         WHERE conversation_id = cv.id
         ORDER BY created_at DESC LIMIT 1
       ) lm ON true
       WHERE ${where}
       ORDER BY cv.last_message_at DESC NULLS LAST
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) FROM conversations cv WHERE ${where}`,
      values
    ),
  ])

  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function getConversation(workspaceId: string, conversationId: string) {
  const result = await query(
    `SELECT
       cv.id, cv.status, cv.assignee_type, cv.assigned_to, cv.unread_count,
       cv.last_message_at, cv.ai_paused_until, cv.created_at,
       c.id as contact_id, c.name as contact_name, c.phone as contact_phone, c.status as contact_status,
       u.name as assigned_name,
       wn.phone_number as whatsapp_number
     FROM conversations cv
     JOIN contacts c ON c.id = cv.contact_id
     LEFT JOIN users u ON u.id = cv.assigned_to
     LEFT JOIN whatsapp_numbers wn ON wn.id = cv.number_id
     WHERE cv.id = $1 AND cv.workspace_id = $2`,
    [conversationId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Conversa')
  return result.rows[0]
}

export async function assignConversation(
  workspaceId: string,
  conversationId: string,
  assignedTo: string | null,
  assigneeType: AssigneeType
) {
  const aiPausedUntil = assigneeType === 'humano'
    ? new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h
    : null

  const result = await query(
    `UPDATE conversations
     SET assignee_type = $1, assigned_to = $2, ai_paused_until = $3, status = 'em_atendimento'
     WHERE id = $4 AND workspace_id = $5`,
    [assigneeType, assignedTo, aiPausedUntil, conversationId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Conversa')
  return getConversation(workspaceId, conversationId)
}

export async function closeConversation(workspaceId: string, conversationId: string) {
  const result = await query(
    `UPDATE conversations SET status = 'fechada', unread_count = 0
     WHERE id = $1 AND workspace_id = $2`,
    [conversationId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Conversa')
}

export async function markAsRead(workspaceId: string, conversationId: string) {
  await query(
    `UPDATE conversations SET unread_count = 0
     WHERE id = $1 AND workspace_id = $2`,
    [conversationId, workspaceId]
  )
  await query(
    `UPDATE messages SET status = 'read'
     WHERE conversation_id = $1 AND direction = 'inbound' AND status != 'read'`,
    [conversationId]
  )
}

export async function getMessages(workspaceId: string, conversationId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)

  const [rows, count] = await Promise.all([
    query(
      `SELECT m.id, m.direction, m.type, m.content, m.media_url, m.status,
              m.sent_by, u.name as sent_by_name, m.created_at, m.metadata
       FROM messages m
       LEFT JOIN users u ON u.id = m.sent_by
       WHERE m.conversation_id = $1 AND m.workspace_id = $2
       ORDER BY m.created_at DESC
       LIMIT $3 OFFSET $4`,
      [conversationId, workspaceId, limit, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND workspace_id = $2',
      [conversationId, workspaceId]
    ),
  ])

  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function findOrCreateConversation(
  workspaceId: string,
  contactId: string,
  numberId?: string
) {
  const existing = await query<{ id: string }>(
    `SELECT id FROM conversations
     WHERE workspace_id = $1 AND contact_id = $2 AND status != 'fechada'
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, contactId]
  )

  if (existing.rowCount) return existing.rows[0].id

  const result = await query<{ id: string }>(
    `INSERT INTO conversations (workspace_id, contact_id, number_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [workspaceId, contactId, numberId || null]
  )
  return result.rows[0].id
}

export async function saveMessage(params: {
  workspaceId: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  type?: string
  content?: string
  mediaUrl?: string
  status?: string
  externalId?: string
  sentBy?: string | null
  metadata?: Record<string, unknown>
}) {
  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO messages (
         workspace_id, conversation_id, direction, type, content,
         media_url, status, external_id, sent_by, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        params.workspaceId,
        params.conversationId,
        params.direction,
        params.type || 'text',
        params.content || null,
        params.mediaUrl || null,
        params.status || 'sent',
        params.externalId || null,
        params.sentBy || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    )

    // Atualiza conversa
    const unreadIncrement = params.direction === 'inbound' ? 1 : 0
    await client.query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           unread_count = unread_count + $1,
           status = CASE WHEN status = 'fechada' THEN 'aberta' ELSE status END
       WHERE id = $2`,
      [unreadIncrement, params.conversationId]
    )

    return result.rows[0].id
  })
}
