import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env'
import { logger } from './config/logger'
import { swaggerSpec } from './config/swagger'
import { checkConnection } from './db/client'
import { connectRedis } from './db/redis'
import { errorHandler } from './middlewares/errorHandler'

import authRoutes from './modules/auth/auth.routes'
import workspacesRoutes from './modules/workspaces/workspaces.routes'
import contactsRoutes from './modules/contacts/contacts.routes'
import conversationsRoutes from './modules/conversations/conversations.routes'
import whatsappRoutes from './modules/whatsapp/whatsapp.routes'
import professionalsRoutes from './modules/professionals/professionals.routes'
import servicesRoutes from './modules/services/services.routes'
import appointmentsRoutes from './modules/appointments/appointments.routes'
import aiRoutes from './modules/ai/ai.routes'
import paymentsRoutes from './modules/payments/payments.routes'
import broadcastsRoutes from './modules/broadcasts/broadcasts.routes'
import waitlistRoutes from './modules/waitlist/waitlist.routes'
import flowsRoutes from './modules/flows/flows.routes'
import analyticsRoutes from './modules/analytics/analytics.routes'
import automationsRoutes from './modules/automations/automations.routes'
import notificationsRoutes from './modules/notifications/notifications.routes'

import { startAppointmentWorker } from './queues/appointment.queue'
import { startAiWorker } from './queues/ai.queue'
import { startBroadcastWorker } from './queues/broadcast.queue'
import { startNotificationsWorker, scheduleRecurringJobs } from './queues/notifications.queue'

const app = express()

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Swagger — só em dev/staging
if (env.NODE_ENV !== 'production') {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'SaaS Atendimento API',
  }))
  app.get('/docs.json', (_req, res) => res.json(swaggerSpec))
}

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, env: env.NODE_ENV, ts: new Date().toISOString() }))

// Rotas — Fase 1
app.use('/auth',          authRoutes)
app.use('/workspaces',    workspacesRoutes)
app.use('/contacts',      contactsRoutes)
app.use('/conversations', conversationsRoutes)
app.use('/whatsapp',      whatsappRoutes)
app.use('/webhooks/whatsapp', whatsappRoutes)

// Rotas — Fase 2
app.use('/professionals', professionalsRoutes)
app.use('/services',      servicesRoutes)
app.use('/appointments',  appointmentsRoutes)

// Rotas — Fase 3
app.use('/ai',            aiRoutes)

// Rotas — Fase 4
app.use('/payments',      paymentsRoutes)

// Rotas — Fase 5
app.use('/broadcasts',    broadcastsRoutes)
app.use('/waitlist',      waitlistRoutes)

// Rotas — Extras
app.use('/flows',         flowsRoutes)
app.use('/analytics',     analyticsRoutes)
app.use('/automations',   automationsRoutes)
app.use('/notifications', notificationsRoutes)

// 404
app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Rota não encontrada', code: 'NOT_FOUND' } })
})

app.use(errorHandler)

async function bootstrap(): Promise<void> {
  await checkConnection()
  await connectRedis()

  startAppointmentWorker()
  startAiWorker()
  startBroadcastWorker()
  startNotificationsWorker()
  await scheduleRecurringJobs()

  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`)
    if (env.NODE_ENV !== 'production') {
      logger.info(`Swagger docs: http://localhost:${env.PORT}/docs`)
    }
  })
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: err.message })
  process.exit(1)
})

export default app
