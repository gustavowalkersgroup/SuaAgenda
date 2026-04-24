import { Queue, Worker } from 'bullmq'
import { env } from '../config/env'
import { logger } from '../config/logger'

const connection = { url: env.REDIS_URL }

export const appointmentQueue = new Queue('appointments', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export async function scheduleExpirationJob(appointmentId: string, expireAt: Date): Promise<void> {
  const delay = Math.max(0, expireAt.getTime() - Date.now())
  await appointmentQueue.add(
    'expire',
    { appointmentId },
    { delay, jobId: `expire:${appointmentId}` }
  )
}

export async function cancelExpirationJob(appointmentId: string): Promise<void> {
  const job = await appointmentQueue.getJob(`expire:${appointmentId}`)
  if (job) await job.remove()
}

export function startAppointmentWorker(): Worker {
  const worker = new Worker(
    'appointments',
    async (job) => {
      if (job.name === 'expire') {
        const { appointmentId } = job.data as { appointmentId: string }
        const { expireAppointment } = await import('../modules/appointments/appointments.service')
        await expireAppointment(appointmentId)
        logger.info('Appointment expired', { appointmentId })
      }
    },
    { connection }
  )

  worker.on('failed', (job, err) => {
    logger.error('Appointment job failed', { jobId: job?.id, error: err.message })
  })

  return worker
}
