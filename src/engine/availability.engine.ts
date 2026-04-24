/**
 * Availability Engine
 *
 * Calcula slots livres de 30 min para um profissional em um intervalo de datas,
 * respeitando:
 *  - Horário de trabalho por dia da semana
 *  - Bloqueios manuais (folga, compromisso, almoço fixo, almoço dinâmico)
 *  - Agendamentos existentes (CONFIRMADO e PRE_RESERVADO)
 *  - Granularidade fixa de 30 minutos
 */

import {
  startOfDay,
  endOfDay,
  addMinutes,
  isWithinInterval,
  isBefore,
  isAfter,
  getDay,
  parseISO,
  format,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { query } from '../db/client'

export const SLOT_MINUTES = 30
export const TIMEZONE = 'America/Sao_Paulo'

export interface TimeSlot {
  start: Date
  end: Date
  startISO: string
  endISO: string
}

interface WorkingHours {
  dayOfWeek: number
  startTime: string  // 'HH:MM'
  endTime: string
}

interface Block {
  blockType: string
  startAt: Date
  endAt: Date
  lunchDurationMinutes?: number
}

interface OccupiedSlot {
  startAt: Date
  endAt: Date
}

export async function getAvailableSlots(params: {
  professionalId: string
  workspaceId: string
  from: Date
  to: Date
  durationMinutes: number
}): Promise<TimeSlot[]> {
  const { professionalId, workspaceId, from, to, durationMinutes } = params

  const [scheduleRows, blockRows, occupiedRows] = await Promise.all([
    query<{ day_of_week: number; start_time: string; end_time: string }>(
      `SELECT day_of_week, start_time, end_time
       FROM professional_schedules
       WHERE professional_id = $1`,
      [professionalId]
    ),
    query<{ block_type: string; start_at: string; end_at: string; lunch_duration_minutes: number | null }>(
      `SELECT block_type, start_at, end_at, lunch_duration_minutes
       FROM availability_blocks
       WHERE professional_id = $1 AND workspace_id = $2
         AND start_at < $4 AND end_at > $3`,
      [professionalId, workspaceId, from.toISOString(), to.toISOString()]
    ),
    query<{ starts_at: string; ends_at: string }>(
      `SELECT aps.starts_at, aps.ends_at
       FROM appointment_services aps
       JOIN appointments a ON a.id = aps.appointment_id
       WHERE aps.professional_id = $1
         AND a.status IN ('PRE_RESERVADO', 'CONFIRMADO')
         AND aps.starts_at < $3 AND aps.ends_at > $2`,
      [professionalId, from.toISOString(), to.toISOString()]
    ),
  ])

  const schedule: WorkingHours[] = scheduleRows.rows.map((r) => ({
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    endTime: r.end_time,
  }))

  const blocks: Block[] = blockRows.rows.map((r) => ({
    blockType: r.block_type,
    startAt: new Date(r.start_at),
    endAt: new Date(r.end_at),
    lunchDurationMinutes: r.lunch_duration_minutes ?? undefined,
  }))

  const occupied: OccupiedSlot[] = occupiedRows.rows.map((r) => ({
    startAt: new Date(r.starts_at),
    endAt: new Date(r.ends_at),
  }))

  return computeAvailableSlots({ schedule, blocks, occupied, from, to, durationMinutes })
}

export function computeAvailableSlots(params: {
  schedule: WorkingHours[]
  blocks: Block[]
  occupied: OccupiedSlot[]
  from: Date
  to: Date
  durationMinutes: number
}): TimeSlot[] {
  const { schedule, blocks, occupied, from, to, durationMinutes } = params
  const slots: TimeSlot[] = []

  // Itera dia a dia dentro da janela
  let cursor = startOfDay(toZonedTime(from, TIMEZONE))
  const endDate = endOfDay(toZonedTime(to, TIMEZONE))

  while (isBefore(cursor, endDate)) {
    const dow = getDay(cursor)
    const workHours = schedule.find((s) => s.dayOfWeek === dow)

    if (workHours) {
      const daySlots = getDaySlots(cursor, workHours, blocks, occupied, durationMinutes, from, to)
      slots.push(...daySlots)
    }

    cursor = addMinutes(cursor, 24 * 60)
  }

  return slots
}

function getDaySlots(
  day: Date,
  workHours: WorkingHours,
  blocks: Block[],
  occupied: OccupiedSlot[],
  durationMinutes: number,
  windowFrom: Date,
  windowTo: Date
): TimeSlot[] {
  const slots: TimeSlot[] = []

  const [startH, startM] = workHours.startTime.split(':').map(Number)
  const [endH, endM] = workHours.endTime.split(':').map(Number)

  let slotStart = fromZonedTime(
    setMilliseconds(setSeconds(setMinutes(setHours(day, startH), startM), 0), 0),
    TIMEZONE
  )
  const workEnd = fromZonedTime(
    setMilliseconds(setSeconds(setMinutes(setHours(day, endH), endM), 0), 0),
    TIMEZONE
  )

  while (isBefore(slotStart, workEnd)) {
    const slotEnd = addMinutes(slotStart, durationMinutes)

    if (isAfter(slotEnd, workEnd)) break

    // Só gera slots dentro da janela solicitada
    if (
      !isBefore(slotStart, windowFrom) &&
      !isAfter(slotEnd, windowTo) &&
      isSlotFree(slotStart, slotEnd, blocks, occupied)
    ) {
      slots.push({
        start: slotStart,
        end: slotEnd,
        startISO: slotStart.toISOString(),
        endISO: slotEnd.toISOString(),
      })
    }

    slotStart = addMinutes(slotStart, SLOT_MINUTES)
  }

  return slots
}

function isSlotFree(start: Date, end: Date, blocks: Block[], occupied: OccupiedSlot[]): boolean {
  for (const block of blocks) {
    if (overlaps(start, end, block.startAt, block.endAt)) return false
  }

  for (const occ of occupied) {
    if (overlaps(start, end, occ.startAt, occ.endAt)) return false
  }

  return true
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return isBefore(aStart, bEnd) && isAfter(aEnd, bStart)
}

// Verifica se um slot específico ainda está livre (usado na confirmação para evitar race condition)
export async function isSlotAvailable(params: {
  professionalId: string
  startAt: Date
  endAt: Date
  excludeAppointmentId?: string
}): Promise<boolean> {
  const { professionalId, startAt, endAt, excludeAppointmentId } = params

  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM appointment_services aps
     JOIN appointments a ON a.id = aps.appointment_id
     WHERE aps.professional_id = $1
       AND a.status IN ('PRE_RESERVADO', 'CONFIRMADO')
       AND aps.starts_at < $3 AND aps.ends_at > $2
       ${excludeAppointmentId ? 'AND a.id != $4' : ''}`,
    excludeAppointmentId
      ? [professionalId, startAt.toISOString(), endAt.toISOString(), excludeAppointmentId]
      : [professionalId, startAt.toISOString(), endAt.toISOString()]
  )

  return Number(result.rows[0].count) === 0
}
