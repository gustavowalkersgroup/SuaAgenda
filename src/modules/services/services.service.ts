import { query, withTransaction } from '../../db/client'
import { NotFoundError, AppError } from '../../shared/errors'
import { getPaginationParams, paginate } from '../../shared/pagination'

interface CreateServiceDTO {
  name: string
  description?: string
  durationMinutes: number
  price: number
  depositPercent?: number
  professionalIds?: string[]
}

export async function listServices(workspaceId: string, queryParams: Record<string, unknown>) {
  const { limit, offset, page } = getPaginationParams(queryParams)

  const [rows, count] = await Promise.all([
    query(
      `SELECT s.id, s.name, s.description,
              s.duration_minutes AS "durationMinutes",
              s.price,
              s.deposit_percent AS "depositPercent",
              s.is_active AS "isActive",
              COALESCE(json_agg(
                json_build_object('id', p.id, 'name', p.name)
              ) FILTER (WHERE p.id IS NOT NULL), '[]') as professionals
       FROM services s
       LEFT JOIN service_professionals sp ON sp.service_id = s.id
       LEFT JOIN professionals p ON p.id = sp.professional_id AND p.is_active = true
       WHERE s.workspace_id = $1
       GROUP BY s.id
       ORDER BY s.name
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    ),
    query<{ count: string }>('SELECT COUNT(*) FROM services WHERE workspace_id = $1', [workspaceId]),
  ])

  return paginate(rows.rows, Number(count.rows[0].count), page, limit)
}

export async function getService(workspaceId: string, serviceId: string) {
  const result = await query(
    `SELECT s.id, s.name, s.description,
            s.duration_minutes AS "durationMinutes",
            s.price,
            s.deposit_percent AS "depositPercent",
            s.is_active AS "isActive",
            COALESCE(json_agg(
              json_build_object('id', p.id, 'name', p.name)
            ) FILTER (WHERE p.id IS NOT NULL), '[]') as professionals
     FROM services s
     LEFT JOIN service_professionals sp ON sp.service_id = s.id
     LEFT JOIN professionals p ON p.id = sp.professional_id AND p.is_active = true
     WHERE s.id = $1 AND s.workspace_id = $2
     GROUP BY s.id`,
    [serviceId, workspaceId]
  )
  if (!result.rowCount) throw new NotFoundError('Serviço')
  return result.rows[0]
}

export async function createService(workspaceId: string, dto: CreateServiceDTO) {
  if (dto.durationMinutes % 30 !== 0) {
    throw new AppError('Duração deve ser múltiplo de 30 minutos', 400)
  }

  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO services (workspace_id, name, description, duration_minutes, price, deposit_percent)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [workspaceId, dto.name, dto.description || null, dto.durationMinutes, dto.price, dto.depositPercent ?? 0]
    )
    const serviceId = result.rows[0].id

    if (dto.professionalIds?.length) {
      await syncProfessionals(client, workspaceId, serviceId, dto.professionalIds)
    }

    return getService(workspaceId, serviceId)
  })
}

export async function updateService(workspaceId: string, serviceId: string, dto: Partial<CreateServiceDTO> & { isActive?: boolean }) {
  if (dto.durationMinutes !== undefined && dto.durationMinutes % 30 !== 0) {
    throw new AppError('Duração deve ser múltiplo de 30 minutos', 400)
  }

  return withTransaction(async (client) => {
    const fields: string[] = []
    const values: unknown[] = []
    let i = 1

    if (dto.name !== undefined) { fields.push(`name = $${i++}`); values.push(dto.name) }
    if (dto.description !== undefined) { fields.push(`description = $${i++}`); values.push(dto.description) }
    if (dto.durationMinutes !== undefined) { fields.push(`duration_minutes = $${i++}`); values.push(dto.durationMinutes) }
    if (dto.price !== undefined) { fields.push(`price = $${i++}`); values.push(dto.price) }
    if (dto.depositPercent !== undefined) { fields.push(`deposit_percent = $${i++}`); values.push(dto.depositPercent) }
    if (dto.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(dto.isActive) }

    if (fields.length) {
      values.push(workspaceId, serviceId)
      const r = await client.query(
        `UPDATE services SET ${fields.join(', ')}
         WHERE workspace_id = $${i++} AND id = $${i++}`,
        values
      )
      if (!r.rowCount) throw new NotFoundError('Serviço')
    }

    if (dto.professionalIds !== undefined) {
      await syncProfessionals(client, workspaceId, serviceId, dto.professionalIds)
    }

    return getService(workspaceId, serviceId)
  })
}

async function syncProfessionals(
  client: Awaited<ReturnType<typeof import('../../db/client').getClient>>,
  workspaceId: string,
  serviceId: string,
  professionalIds: string[]
) {
  // Valida que os profissionais pertencem ao workspace
  if (professionalIds.length) {
    const check = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM professionals
       WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND is_active = true`,
      [workspaceId, professionalIds]
    )
    if (Number(check.rows[0].count) !== professionalIds.length) {
      throw new NotFoundError('Um ou mais profissionais')
    }
  }

  await client.query('DELETE FROM service_professionals WHERE service_id = $1', [serviceId])
  for (const pid of professionalIds) {
    await client.query(
      'INSERT INTO service_professionals (service_id, professional_id) VALUES ($1,$2)',
      [serviceId, pid]
    )
  }
}

export async function deleteService(workspaceId: string, serviceId: string) {
  const result = await query(
    'UPDATE services SET is_active = false WHERE workspace_id = $1 AND id = $2',
    [workspaceId, serviceId]
  )
  if (!result.rowCount) throw new NotFoundError('Serviço')
}

// Busca serviços com profissionais disponíveis — usado pelo scheduling engine
export async function getServicesWithProfessionals(workspaceId: string, serviceIds: string[]) {
  const result = await query<{
    id: string
    name: string
    duration_minutes: number
    price: number
    deposit_percent: number
    professional_ids: string[]
  }>(
    `SELECT s.id, s.name, s.duration_minutes, s.price, s.deposit_percent,
            array_agg(sp.professional_id) as professional_ids
     FROM services s
     JOIN service_professionals sp ON sp.service_id = s.id
     JOIN professionals p ON p.id = sp.professional_id AND p.is_active = true
     WHERE s.workspace_id = $1 AND s.id = ANY($2::uuid[]) AND s.is_active = true
     GROUP BY s.id`,
    [workspaceId, serviceIds]
  )

  if (result.rowCount !== serviceIds.length) {
    throw new AppError('Um ou mais serviços inválidos ou sem profissionais', 400)
  }

  return result.rows
}
