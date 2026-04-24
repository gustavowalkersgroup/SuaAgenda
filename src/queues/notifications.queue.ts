import { Queue, Worker } from 'bullmq'
import { env } from '../config/env'
import { logger } from '../config/logger'

const connection = { url: env.REDIS_URL }

export const notificationsQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200 },
})

export async function scheduleRecurringJobs(): Promise<void> {
  // Remove jobs existentes para recriar com config atual
  await notificationsQueue.obliterate({ force: true }).catch(() => {})

  // Lembretes — a cada 15 minutos
  await notificationsQueue.add('reminders', {}, {
    repeat: { pattern: '*/15 * * * *' },
    jobId: 'recurring:reminders',
  })

  // No-show — a cada 5 minutos
  await notificationsQueue.add('noshows', {}, {
    repeat: { pattern: '*/5 * * * *' },
    jobId: 'recurring:noshows',
  })

  // Automações de marketing — a cada hora
  await notificationsQueue.add('automations', {}, {
    repeat: { pattern: '0 * * * *' },
    jobId: 'recurring:automations',
  })

  logger.info('Recurring notification jobs scheduled')
}

export function startNotificationsWorker(): Worker {
  const worker = new Worker(
    'notifications',
    async (job) => {
      switch (job.name) {
        case 'reminders': {
          const { processReminders } = await import('../modules/notifications/notifications.service')
          await processReminders()
          break
        }
        case 'noshows': {
          const { processNoShows } = await import('../modules/notifications/notifications.service')
          await processNoShows()
          break
        }
        case 'automations': {
          const { processAutomations } = await import('../modules/automations/automations.service')
          await processAutomations()
          break
        }
      }
    },
    { connection, concurrency: 1 }
  )

  worker.on('failed', (job, err) => {
    logger.error('Notification job failed', { name: job?.name, error: err.message })
  })

  return worker
}
