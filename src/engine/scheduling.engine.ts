/**
 * Scheduling Engine
 *
 * Dado N serviços (máx 3), encontra combinações válidas de horários onde:
 *  - Cada serviço tem um profissional disponível
 *  - Serviços são encaixados de forma sequencial (ou paralela se habilitado)
 *  - Gap entre serviços = granularidade (30 min)
 *  - Máx 2 simultâneos
 *  - Máx 3 sequenciais
 *  - Retorna até 9 sugestões (3 grupos de 3 opções)
 */

import { addMinutes, isBefore, isAfter } from 'date-fns'
import { getAvailableSlots, isSlotAvailable, SLOT_MINUTES, TimeSlot } from './availability.engine'
import { AppError } from '../shared/errors'

const MAX_SERVICES = 3
const MAX_SUGGESTIONS = 9
const MAX_SIMULTANEOUS = 2

export interface ServiceInput {
  serviceId: string
  name: string
  durationMinutes: number
  professionalIds: string[]  // profissionais habilitados para este serviço
}

export interface SlotAssignment {
  serviceId: string
  serviceName: string
  professionalId: string
  startAt: Date
  endAt: Date
}

export interface ScheduleSuggestion {
  startsAt: Date
  endsAt: Date
  totalMinutes: number
  assignments: SlotAssignment[]
}

export async function findAvailableSchedules(params: {
  workspaceId: string
  services: ServiceInput[]
  from: Date
  to: Date
  parallelEnabled: boolean
}): Promise<ScheduleSuggestion[]> {
  const { workspaceId, services, from, to, parallelEnabled } = params

  if (services.length === 0 || services.length > MAX_SERVICES) {
    throw new AppError(`Informe entre 1 e ${MAX_SERVICES} serviços`, 400)
  }

  // Pré-carrega slots disponíveis para cada profissional de cada serviço
  const slotMap = await preloadSlots(workspaceId, services, from, to)

  const suggestions: ScheduleSuggestion[] = []

  if (parallelEnabled) {
    await findParallelSuggestions(services, slotMap, suggestions)
  } else {
    await findSequentialSuggestions(services, slotMap, suggestions)
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}

// ==========================================================================
// SEQUENTIAL (default)
// ==========================================================================

async function findSequentialSuggestions(
  services: ServiceInput[],
  slotMap: SlotMap,
  out: ScheduleSuggestion[]
): Promise<void> {
  // Pega os slots do primeiro serviço como âncoras de horário de início
  const firstService = services[0]

  for (const [profId, slots] of Object.entries(slotMap[firstService.serviceId])) {
    for (const anchorSlot of slots) {
      if (out.length >= MAX_SUGGESTIONS) return

      const assignments: SlotAssignment[] = []
      let valid = true
      let nextStart = anchorSlot.start

      for (const svc of services) {
        const result = findEarliestSlotFrom(slotMap[svc.serviceId], nextStart, svc.durationMinutes, svc.serviceId === firstService.serviceId ? profId : undefined)

        if (!result) { valid = false; break }

        assignments.push({
          serviceId: svc.serviceId,
          serviceName: svc.name,
          professionalId: result.professionalId,
          startAt: result.slot.start,
          endAt: result.slot.end,
        })

        // Próximo serviço começa após gap de 30 min
        nextStart = addMinutes(result.slot.end, SLOT_MINUTES)
      }

      if (valid && assignments.length === services.length) {
        out.push(buildSuggestion(assignments))
      }
    }
  }
}

// ==========================================================================
// PARALLEL
// ==========================================================================

async function findParallelSuggestions(
  services: ServiceInput[],
  slotMap: SlotMap,
  out: ScheduleSuggestion[]
): Promise<void> {
  if (services.length === 1) {
    return findSequentialSuggestions(services, slotMap, out)
  }

  const firstService = services[0]

  for (const [profId, slots] of Object.entries(slotMap[firstService.serviceId])) {
    for (const anchorSlot of slots) {
      if (out.length >= MAX_SUGGESTIONS) return

      // Tenta encaixar todos os serviços no mesmo horário (paralelo)
      const assignments: SlotAssignment[] = []
      const usedProfs = new Set<string>()
      let valid = true

      for (const svc of services) {
        const result = findSlotAt(
          slotMap[svc.serviceId],
          anchorSlot.start,
          svc.durationMinutes,
          usedProfs,
          svc.serviceId === firstService.serviceId ? profId : undefined
        )

        if (!result) {
          // Se não couber paralelo, cai em sequencial para este grupo
          valid = false
          break
        }

        usedProfs.add(result.professionalId)
        assignments.push({
          serviceId: svc.serviceId,
          serviceName: svc.name,
          professionalId: result.professionalId,
          startAt: result.slot.start,
          endAt: result.slot.end,
        })

        // Garante limite de simultaneidade
        if (usedProfs.size > MAX_SIMULTANEOUS) { valid = false; break }
      }

      if (valid && assignments.length === services.length) {
        out.push(buildSuggestion(assignments))
      }
    }
  }
}

// ==========================================================================
// HELPERS
// ==========================================================================

type SlotMap = Record<string, Record<string, TimeSlot[]>>

async function preloadSlots(
  workspaceId: string,
  services: ServiceInput[],
  from: Date,
  to: Date
): Promise<SlotMap> {
  const map: SlotMap = {}

  for (const svc of services) {
    map[svc.serviceId] = {}

    await Promise.all(
      svc.professionalIds.map(async (profId) => {
        const slots = await getAvailableSlots({
          professionalId: profId,
          workspaceId,
          from,
          to,
          durationMinutes: svc.durationMinutes,
        })
        map[svc.serviceId][profId] = slots
      })
    )
  }

  return map
}

function findEarliestSlotFrom(
  profSlots: Record<string, TimeSlot[]>,
  notBefore: Date,
  durationMinutes: number,
  preferProfId?: string
): { slot: TimeSlot; professionalId: string } | null {
  let best: { slot: TimeSlot; professionalId: string } | null = null

  const profIds = preferProfId
    ? [preferProfId, ...Object.keys(profSlots).filter((p) => p !== preferProfId)]
    : Object.keys(profSlots)

  for (const profId of profIds) {
    const slots = profSlots[profId] ?? []
    for (const slot of slots) {
      if (!isBefore(slot.start, notBefore)) {
        if (!best || isBefore(slot.start, best.slot.start)) {
          best = { slot, professionalId: profId }
        }
        break // slots já estão ordenados
      }
    }
  }

  return best
}

function findSlotAt(
  profSlots: Record<string, TimeSlot[]>,
  at: Date,
  durationMinutes: number,
  excludedProfs: Set<string>,
  preferProfId?: string
): { slot: TimeSlot; professionalId: string } | null {
  const candidates = preferProfId
    ? [preferProfId, ...Object.keys(profSlots).filter((p) => p !== preferProfId && !excludedProfs.has(p))]
    : Object.keys(profSlots).filter((p) => !excludedProfs.has(p))

  for (const profId of candidates) {
    const slots = profSlots[profId] ?? []
    const match = slots.find(
      (s) => s.start.getTime() === at.getTime()
    )
    if (match) return { slot: match, professionalId: profId }
  }

  return null
}

function buildSuggestion(assignments: SlotAssignment[]): ScheduleSuggestion {
  const sorted = [...assignments].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  const startsAt = sorted[0].startAt
  const endsAt = sorted.reduce((latest, a) => (isAfter(a.endAt, latest) ? a.endAt : latest), sorted[0].endAt)
  const totalMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000)

  return { startsAt, endsAt, totalMinutes, assignments }
}

// Revalidação antes de confirmar (anti race-condition)
export async function revalidateAssignments(assignments: SlotAssignment[], excludeAppointmentId?: string): Promise<boolean> {
  const checks = await Promise.all(
    assignments.map((a) =>
      isSlotAvailable({
        professionalId: a.professionalId,
        startAt: a.startAt,
        endAt: a.endAt,
        excludeAppointmentId,
      })
    )
  )
  return checks.every(Boolean)
}
