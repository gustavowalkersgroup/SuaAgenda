import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as service from './analytics.service'
import { authenticate } from '../../middlewares/auth'
import { AuthRequest } from '../../shared/types'
import { subDays, startOfDay, endOfDay } from 'date-fns'

const router = Router()
const auth = authenticate as never
const a = (fn: (req: AuthRequest, ...args: never[]) => unknown) => fn as never

const periodSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
})

function resolvePeriod(query: Record<string, unknown>) {
  const { from, to, days } = periodSchema.parse(query)
  const d = days ?? 30
  const resolvedFrom = from ? new Date(from) : startOfDay(subDays(new Date(), d))
  const resolvedTo   = to   ? new Date(to)   : endOfDay(new Date())
  return { from: resolvedFrom.toISOString(), to: resolvedTo.toISOString() }
}

router.get('/dashboard', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to } = resolvePeriod(req.query as never)
    res.json(await service.getDashboardStats(req.auth.workspaceId, from, to))
  } catch (err) { next(err) }
}))

router.get('/appointments/timeline', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to } = resolvePeriod(req.query as never)
    res.json(await service.getAppointmentTimeline(req.auth.workspaceId, from, to))
  } catch (err) { next(err) }
}))

router.get('/services/top', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to } = resolvePeriod(req.query as never)
    res.json(await service.getTopServices(req.auth.workspaceId, from, to))
  } catch (err) { next(err) }
}))

router.get('/professionals/top', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to } = resolvePeriod(req.query as never)
    res.json(await service.getTopProfessionals(req.auth.workspaceId, from, to))
  } catch (err) { next(err) }
}))

router.get('/contacts/growth', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to } = resolvePeriod(req.query as never)
    res.json(await service.getContactsGrowth(req.auth.workspaceId, from, to))
  } catch (err) { next(err) }
}))

router.get('/professionals/occupancy', auth, a(async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { from, to } = resolvePeriod(req.query as never)
    res.json(await service.getOccupancyRate(req.auth.workspaceId, from, to))
  } catch (err) { next(err) }
}))

export default router
