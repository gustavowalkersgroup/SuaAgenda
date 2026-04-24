import { query, withTransaction } from '../../db/client'
import { NotFoundError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'

interface CreateProfessionalDTO {
  name: string
  userId?: string
  phone?: string
  schedule?: DaySchedule[]
}

interface DaySchedule {
  dayOfWeek: number   // 0=domingo … 6=sábado
  startTime: string   // 'HH:MM'
  endTime: string
}

interface CreateBlockDTO {
  blockType: 'folga' | 'compromisso' | 'almoco_fixo' | 'almoco_dinamico'
  startAt: string
  endAt: string
  reason?: string
  lunchDurationMinutes?: number
}

export async function listProfessionals(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)
  const [rows, count] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.phone, p.is_active, p.user_id, u.name as user_name,
              COALESCE(json_agg(
                json_build_object(
                  'dayOfWeek', ps.day_of_week,
                  'startTime', ps.start_time,
                  'endTime', ps.end_time
                ) ORDER BY ps.day_of_week
              ) FILTER (WHERE ps.professional_id IS NOT NULL), '[]') as schedule
       FROM professionals p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN professional_schedules ps ON ps.professional_id = p.id
       WHERE p.workspace_id = $1
       GROUP BY p.id, u.name
       ORDER BY p.name
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*) FROM professionals WHERE workspace_id = $1',
      [workspaceId]
    ),
  ])
  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function getProfessional(workspaceId: string, professionalId: string) {
  const result = await query(
    `SELECT p.id, p.name, p.phone, p.is_active, p.user_id, u.name as user_name,
            COALESCE(json_agg(
              json_build_object(
                'dayOfWeek', ps.day_of_week,
                'startTime', ps.start_time,
                'endTime', ps.end_time
              ) ORDER BY ps.day_of_week
            ) FILTER (WHERE ps.professional_id IS NOT NULL), '[]') as schedule
     FROM professionals p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN professional_schedules ps ON ps.professional_id = p.id
     WHERE p.id = $1 AND p.workspace_id = $2
     GROUP BY p.id, u.name`,
    [professionalId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Profissional')
  return result.rows[0]
}

export async function createProfessional(workspaceId: string, dto: CreateProfessionalDTO) {
  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO professionals (workspace_id, name, user_id, phone)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [workspaceId, dto.name, dto.userId || null, dto.phone || null]
    )
    const professionalId = result.rows[0].id

    if (dto.schedule?.length) {
      for (const s of dto.schedule) {
        await client.query(
          `INSERT INTO professional_schedules (professional_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (professional_id, day_of_week) DO UPDATE
           SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time`,
          [professionalId, s.dayOfWeek, s.startTime, s.endTime]
        )
      }
    }

    return getProfessional(workspaceId, professionalId)
  })
}

export async function updateProfessional(
  workspaceId: string,
  professionalId: string,
  dto: Partial<CreateProfessionalDTO> & { isActive?: boolean }
) {
  return withTransaction(async (client) => {
    const fields: string[] = []
    const values: unknown[] = []
    let i = 1

    if (dto.name !== undefined) { fields.push(`name = $${i++}`); values.push(dto.name) }
    if (dto.phone !== undefined) { fields.push(`phone = $${i++}`); values.push(dto.phone) }
    if (dto.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(dto.isActive) }

    if (fields.length) {
      values.push(workspaceId, professionalId)
      const r = await client.query(
        `UPDATE professionals SET ${fields.join(', ')}
         WHERE workspace_id = $${i++} AND id = $${i++}`,
        values
      )
      if (!r.rowCount) throw new NotFoundError('Profissional')
    }

    if (dto.schedule?.length) {
      await client.query('DELETE FROM professional_schedules WHERE professional_id = $1', [professionalId])
      for (const s of dto.schedule) {
        await client.query(
          `INSERT INTO professional_schedules (professional_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [professionalId, s.dayOfWeek, s.startTime, s.endTime]
        )
      }
    }

    return getProfessional(workspaceId, professionalId)
  })
}

export async function deleteProfessional(workspaceId: string, professionalId: string) {
  const result = await query(
    `UPDATE professionals SET is_active = false
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, professionalId]
  )
  if (!result.rowCount) throw new NotFoundError('Profissional')
}

// Bloqueios de disponibilidade
export async function createBlock(workspaceId: string, professionalId: string, dto: CreateBlockDTO) {
  const exists = await query(
    'SELECT id FROM professionals WHERE workspace_id = $1 AND id = $2',
    [workspaceId, professionalId]
  )
  if (!exists.rowCount) throw new NotFoundError('Profissional')

  const result = await query<{ id: string }>(
    `INSERT INTO availability_blocks
       (workspace_id, professional_id, block_type, start_at, end_at, reason, lunch_duration_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      workspaceId, professionalId, dto.blockType,
      dto.startAt, dto.endAt, dto.reason || null,
      dto.lunchDurationMinutes || null,
    ]
  )
  return result.rows[0].id
}

export async function listBlocks(workspaceId: string, professionalId: string, from: string, to: string) {
  const result = await query(
    `SELECT id, block_type, start_at, end_at, reason, lunch_duration_minutes
     FROM availability_blocks
     WHERE workspace_id = $1 AND professional_id = $2
       AND start_at < $4 AND end_at > $3
     ORDER BY start_at`,
    [workspaceId, professionalId, from, to]
  )
  return result.rows
}

export async function deleteBlock(workspaceId: string, blockId: string) {
  await query(
    'DELETE FROM availability_blocks WHERE workspace_id = $1 AND id = $2',
    [workspaceId, blockId]
  )
}
