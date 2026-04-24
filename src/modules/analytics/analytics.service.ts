import { query } from '../../db/client'

export async function getDashboardStats(workspaceId: string, from: string, to: string) {
  const [appointments, revenue, contacts, conversations, broadcasts, noShows] = await Promise.all([
    // Agendamentos por status
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count
       FROM appointments
       WHERE workspace_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY status`,
      [workspaceId, from, to]
    ),

    // Receita confirmada
    query<{ total: string; deposit_total: string }>(
      `SELECT
         COALESCE(SUM(total_price), 0) as total,
         COALESCE(SUM(deposit_amount), 0) as deposit_total
       FROM appointments
       WHERE workspace_id = $1 AND status = 'CONFIRMADO'
         AND confirmed_at BETWEEN $2 AND $3`,
      [workspaceId, from, to]
    ),

    // Novos contatos
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM contacts WHERE workspace_id = $1 AND created_at BETWEEN $2 AND $3`,
      [workspaceId, from, to]
    ),

    // Conversas abertas vs fechadas
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM conversations
       WHERE workspace_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY status`,
      [workspaceId, from, to]
    ),

    // Broadcasts
    query<{ total_sent: string; total_failed: string }>(
      `SELECT COALESCE(SUM(sent),0) as total_sent, COALESCE(SUM(failed),0) as total_failed
       FROM broadcasts WHERE workspace_id = $1 AND created_at BETWEEN $2 AND $3`,
      [workspaceId, from, to]
    ),

    // Taxa de no-show
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM appointments
       WHERE workspace_id = $1 AND status = 'NO_SHOW' AND created_at BETWEEN $2 AND $3`,
      [workspaceId, from, to]
    ),
  ])

  const apptByStatus = Object.fromEntries(appointments.rows.map((r) => [r.status, Number(r.count)]))
  const totalAppts = Object.values(apptByStatus).reduce((a, b) => a + b, 0)

  return {
    period: { from, to },
    appointments: {
      total: totalAppts,
      byStatus: apptByStatus,
      noShowRate: totalAppts > 0 ? ((Number(noShows.rows[0].count) / totalAppts) * 100).toFixed(1) : '0',
      cancellationRate: totalAppts > 0 ? (((apptByStatus['CANCELADO'] || 0) / totalAppts) * 100).toFixed(1) : '0',
    },
    revenue: {
      confirmed: Number(revenue.rows[0].total).toFixed(2),
      depositCollected: Number(revenue.rows[0].deposit_total).toFixed(2),
    },
    contacts: {
      new: Number(contacts.rows[0].count),
    },
    conversations: {
      byStatus: Object.fromEntries(conversations.rows.map((r) => [r.status, Number(r.count)])),
    },
    broadcasts: {
      sent: Number(broadcasts.rows[0].total_sent),
      failed: Number(broadcasts.rows[0].total_failed),
    },
  }
}

export async function getAppointmentTimeline(workspaceId: string, from: string, to: string) {
  const result = await query<{ day: string; confirmed: string; cancelled: string; no_show: string }>(
    `SELECT
       DATE_TRUNC('day', starts_at AT TIME ZONE 'America/Sao_Paulo')::date as day,
       COUNT(*) FILTER (WHERE status = 'CONFIRMADO') as confirmed,
       COUNT(*) FILTER (WHERE status = 'CANCELADO') as cancelled,
       COUNT(*) FILTER (WHERE status = 'NO_SHOW') as no_show
     FROM appointments
     WHERE workspace_id = $1 AND starts_at BETWEEN $2 AND $3
     GROUP BY day
     ORDER BY day`,
    [workspaceId, from, to]
  )
  return result.rows
}

export async function getTopServices(workspaceId: string, from: string, to: string) {
  const result = await query<{ service_name: string; count: string; revenue: string }>(
    `SELECT s.name as service_name,
            COUNT(aps.id) as count,
            COALESCE(SUM(aps.price), 0) as revenue
     FROM appointment_services aps
     JOIN services s ON s.id = aps.service_id
     JOIN appointments a ON a.id = aps.appointment_id
     WHERE a.workspace_id = $1
       AND a.status IN ('CONFIRMADO', 'CONCLUIDO')
       AND a.starts_at BETWEEN $2 AND $3
     GROUP BY s.name
     ORDER BY count DESC
     LIMIT 10`,
    [workspaceId, from, to]
  )
  return result.rows
}

export async function getTopProfessionals(workspaceId: string, from: string, to: string) {
  const result = await query<{ professional_name: string; count: string; revenue: string }>(
    `SELECT p.name as professional_name,
            COUNT(aps.id) as count,
            COALESCE(SUM(aps.price), 0) as revenue
     FROM appointment_services aps
     JOIN professionals p ON p.id = aps.professional_id
     JOIN appointments a ON a.id = aps.appointment_id
     WHERE a.workspace_id = $1
       AND a.status IN ('CONFIRMADO', 'CONCLUIDO')
       AND a.starts_at BETWEEN $2 AND $3
     GROUP BY p.name
     ORDER BY count DESC
     LIMIT 10`,
    [workspaceId, from, to]
  )
  return result.rows
}

export async function getContactsGrowth(workspaceId: string, from: string, to: string) {
  const result = await query<{ day: string; new_contacts: string; total: string }>(
    `SELECT
       DATE_TRUNC('day', created_at AT TIME ZONE 'America/Sao_Paulo')::date as day,
       COUNT(*) as new_contacts,
       SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('day', created_at)) as total
     FROM contacts
     WHERE workspace_id = $1 AND created_at BETWEEN $2 AND $3
     GROUP BY day
     ORDER BY day`,
    [workspaceId, from, to]
  )
  return result.rows
}

export async function getOccupancyRate(workspaceId: string, from: string, to: string) {
  const result = await query<{ professional_name: string; slots_occupied: string; occupancy_pct: string }>(
    `WITH occupied AS (
       SELECT aps.professional_id, COUNT(*) as slots_occupied
       FROM appointment_services aps
       JOIN appointments a ON a.id = aps.appointment_id
       WHERE a.workspace_id = $1
         AND a.status IN ('CONFIRMADO','CONCLUIDO')
         AND aps.starts_at BETWEEN $2 AND $3
       GROUP BY aps.professional_id
     )
     SELECT p.name as professional_name,
            COALESCE(o.slots_occupied, 0) as slots_occupied,
            ROUND(COALESCE(o.slots_occupied::numeric, 0) / NULLIF(
              EXTRACT(DAY FROM ($3::timestamptz - $2::timestamptz)) *
              (SELECT AVG(EXTRACT(EPOCH FROM (end_time::time - start_time::time))/1800)
               FROM professional_schedules WHERE professional_id = p.id), 0
            ) * 100, 1) as occupancy_pct
     FROM professionals p
     LEFT JOIN occupied o ON o.professional_id = p.id
     WHERE p.workspace_id = $1 AND p.is_active = true`,
    [workspaceId, from, to]
  )
  return result.rows
}
