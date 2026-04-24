/**
 * Broadcast Service — Disparos de marketing
 *
 * Anti-ban:
 * - Velocidade configurável: 1/min (seguro), 5/min (ok), 10/min (arriscado)
 * - Delay aleatório entre mensagens
 * - Até 4 variações de copy por disparo
 * - Suporte a variáveis: {{nome}}, {{telefone}}
 *
 * Segmentação:
 * - Por tags, status do contato, tempo sem interação
 */

import { query, withTransaction } from '../../db/client'
import { NotFoundError, AppError, ConflictError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'
import { enqueueBroadcast } from '../../queues/broadcast.queue'

const MAX_COPY_VARIATIONS = 4
const SPEED_LIMITS = { 1: 1, 5: 5, 10: 10 } as const

export interface BroadcastMessage {
  text: string  // suporta {{nome}}, {{telefone}}
}

export interface SegmentFilter {
  tagIds?: string[]
  statuses?: string[]
  inactiveDays?: number        // contatos sem interação há X dias
  numberIds?: string[]         // filtrar por número de origem
}

interface CreateBroadcastDTO {
  name: string
  numberId: string
  messages: BroadcastMessage[]  // até 4 variações
  speed: 1 | 5 | 10
  segment: SegmentFilter
  scheduledAt?: string
}

// ==========================================================================
// CRUD
// ==========================================================================

export async function createBroadcast(workspaceId: string, dto: CreateBroadcastDTO) {
  if (!dto.messages.length || dto.messages.length > MAX_COPY_VARIATIONS) {
    throw new AppError(`Informe entre 1 e ${MAX_COPY_VARIATIONS} variações de mensagem`, 400)
  }

  if (!SPEED_LIMITS[dto.speed]) {
    throw new AppError('Velocidade inválida. Use: 1, 5 ou 10', 400)
  }

  // Resolve contatos da segmentação
  const recipients = await resolveSegment(workspaceId, dto.segment)
  if (!recipients.length) throw new AppError('Nenhum contato encontrado para o segmento informado', 400)

  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO broadcasts
         (workspace_id, name, number_id, messages, speed, scheduled_at, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
         CASE WHEN $6::timestamptz IS NULL THEN 'rascunho' ELSE 'agendado' END)
       RETURNING id`,
      [
        workspaceId, dto.name, dto.numberId,
        JSON.stringify(dto.messages),
        dto.speed,
        dto.scheduledAt || null,
        recipients.length,
      ]
    )
    const broadcastId = result.rows[0].id

    // Insere destinatários
    for (const r of recipients) {
      await client.query(
        `INSERT INTO broadcast_recipients (broadcast_id, contact_id) VALUES ($1,$2)`,
        [broadcastId, r.id]
      )
    }

    return getBroadcast(workspaceId, broadcastId)
  })
}

export async function getBroadcast(workspaceId: string, broadcastId: string) {
  const result = await query(
    `SELECT b.id, b.name, b.status, b.messages, b.speed, b.scheduled_at,
            b.started_at, b.finished_at, b.total, b.sent, b.failed, b.created_at,
            wn.phone_number as number_phone
     FROM broadcasts b
     LEFT JOIN whatsapp_numbers wn ON wn.id = b.number_id
     WHERE b.id = $1 AND b.workspace_id = $2`,
    [broadcastId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Disparo')
  return result.rows[0]
}

export async function listBroadcasts(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)
  const [rows, count] = await Promise.all([
    query(
      `SELECT b.id, b.name, b.status, b.speed, b.total, b.sent, b.failed,
              b.scheduled_at, b.started_at, b.finished_at, b.created_at
       FROM broadcasts b
       WHERE b.workspace_id = $1
       ORDER BY b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    ),
    query<{ count: string }>('SELECT COUNT(*) FROM broadcasts WHERE workspace_id = $1', [workspaceId]),
  ])
  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function deleteBroadcast(workspaceId: string, broadcastId: string) {
  const result = await query(
    `DELETE FROM broadcasts WHERE workspace_id = $1 AND id = $2 AND status IN ('rascunho','agendado')`,
    [workspaceId, broadcastId]
  )
  if (!result.rowCount) throw new AppError('Disparo não pode ser removido no status atual', 400)
}

// ==========================================================================
// Execução
// ==========================================================================

export async function startBroadcast(workspaceId: string, broadcastId: string): Promise<void> {
  const broadcast = await getBroadcast(workspaceId, broadcastId)

  if (!['rascunho', 'agendado'].includes(broadcast.status)) {
    throw new AppError('Disparo já foi iniciado ou concluído', 400)
  }

  // Busca destinatários pendentes
  const recipients = await query<{ id: string; contact_id: string }>(
    `SELECT id, contact_id FROM broadcast_recipients
     WHERE broadcast_id = $1 AND status = 'pendente'`,
    [broadcastId]
  )

  if (!recipients.rowCount) throw new AppError('Nenhum destinatário pendente', 400)

  await query(
    `UPDATE broadcasts SET status = 'enviando', started_at = NOW() WHERE id = $1`,
    [broadcastId]
  )

  // Enfileira envios com delay calculado
  await enqueueBroadcast({
    workspaceId,
    broadcastId,
    recipients: recipients.rows,
    messages: broadcast.messages as BroadcastMessage[],
    speed: broadcast.speed as 1 | 5 | 10,
    numberId: broadcast.number_id,
  })
}

export async function cancelBroadcast(workspaceId: string, broadcastId: string): Promise<void> {
  const result = await query(
    `UPDATE broadcasts SET status = 'cancelado'
     WHERE workspace_id = $1 AND id = $2 AND status = 'enviando'`,
    [workspaceId, broadcastId]
  )
  if (!result.rowCount) throw new AppError('Apenas disparos em andamento podem ser cancelados', 400)
}

// Chamado pelo worker após cada envio
export async function markRecipientSent(
  broadcastId: string,
  recipientId: string,
  messageUsed: string,
  error?: string
): Promise<void> {
  const status = error ? 'falhou' : 'enviado'

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE broadcast_recipients
       SET status = $1, sent_at = NOW(), message_used = $2, error = $3
       WHERE id = $4`,
      [status, messageUsed, error || null, recipientId]
    )

    await client.query(
      `UPDATE broadcasts SET
         sent  = sent  + CASE WHEN $1 = 'enviado' THEN 1 ELSE 0 END,
         failed = failed + CASE WHEN $1 = 'falhou'  THEN 1 ELSE 0 END
       WHERE id = $2`,
      [status, broadcastId]
    )

    // Verifica se terminou
    const remaining = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM broadcast_recipients
       WHERE broadcast_id = $1 AND status = 'pendente'`,
      [broadcastId]
    )

    if (Number(remaining.rows[0].count) === 0) {
      await client.query(
        `UPDATE broadcasts SET status = 'concluido', finished_at = NOW() WHERE id = $1`,
        [broadcastId]
      )
    }
  })
}

// ==========================================================================
// Segmentação
// ==========================================================================

async function resolveSegment(
  workspaceId: string,
  filter: SegmentFilter
): Promise<Array<{ id: string; name: string; phone: string }>> {
  const conditions: string[] = ['c.workspace_id = $1']
  const values: unknown[] = [workspaceId]
  let i = 2

  if (filter.statuses?.length) {
    conditions.push(`c.status = ANY($${i++}::text[])`)
    values.push(filter.statuses)
  }

  if (filter.tagIds?.length) {
    conditions.push(`EXISTS (
      SELECT 1 FROM contact_tags ct
      WHERE ct.contact_id = c.id AND ct.tag_id = ANY($${i++}::uuid[])
    )`)
    values.push(filter.tagIds)
  }

  if (filter.inactiveDays) {
    conditions.push(`(
      SELECT MAX(m.created_at) FROM messages m
      JOIN conversations cv ON cv.id = m.conversation_id
      WHERE cv.contact_id = c.id AND cv.workspace_id = c.workspace_id
    ) < NOW() - ($${i++} || ' days')::interval`)
    values.push(filter.inactiveDays)
  }

  const result = await query<{ id: string; name: string; phone: string }>(
    `SELECT DISTINCT c.id, c.name, c.phone
     FROM contacts c
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.name`,
    values
  )

  return result.rows
}

// ==========================================================================
// Interpolação de variáveis
// ==========================================================================

export function interpolate(
  template: string,
  contact: { name: string | null; phone: string }
): string {
  return template
    .replace(/\{\{nome\}\}/gi, contact.name || contact.phone)
    .replace(/\{\{telefone\}\}/gi, contact.phone)
    .replace(/\{\{primeiro_nome\}\}/gi, (contact.name || contact.phone).split(' ')[0])
}

export function pickRandomMessage(messages: BroadcastMessage[]): BroadcastMessage {
  return messages[Math.floor(Math.random() * messages.length)]
}
