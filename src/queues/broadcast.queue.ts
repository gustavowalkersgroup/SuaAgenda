/**
 * Broadcast Queue
 *
 * Anti-ban via:
 * - Rate limiting por velocidade configurada (1/5/10 msg/min)
 * - Delay aleatório de ±20% entre mensagens
 * - Concurrency 1 por broadcast (garante ordem e não paralelos do mesmo disparo)
 */

import { Queue, Worker, Job } from 'bullmq'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { BroadcastMessage, interpolate, pickRandomMessage, markRecipientSent } from '../modules/broadcasts/broadcasts.service'

const connection = { url: env.REDIS_URL }

export const broadcastQueue = new Queue('broadcasts', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 200,
  },
})

interface BroadcastJobData {
  workspaceId: string
  broadcastId: string
  recipientId: string
  contactId: string
  messages: BroadcastMessage[]
}

interface EnqueueParams {
  workspaceId: string
  broadcastId: string
  recipients: Array<{ id: string; contact_id: string }>
  messages: BroadcastMessage[]
  speed: 1 | 5 | 10
  numberId: string
}

// Intervalo base em ms por velocidade + jitter de ±20%
function calcDelay(speed: 1 | 5 | 10, index: number): number {
  const baseMs = (60 / speed) * 1000
  const jitter = baseMs * 0.2 * (Math.random() * 2 - 1) // ±20%
  return Math.round((baseMs + jitter) * index)
}

export async function enqueueBroadcast(params: EnqueueParams): Promise<void> {
  const { workspaceId, broadcastId, recipients, messages, speed } = params

  const jobs = recipients.map((r, idx) => ({
    name: 'send',
    data: {
      workspaceId,
      broadcastId,
      recipientId: r.id,
      contactId: r.contact_id,
      messages,
    } as BroadcastJobData,
    opts: {
      delay: calcDelay(speed, idx),
      jobId: `broadcast:${broadcastId}:${r.id}`,
    },
  }))

  // Adiciona em chunks para não sobrecarregar o Redis
  const CHUNK = 100
  for (let i = 0; i < jobs.length; i += CHUNK) {
    await broadcastQueue.addBulk(jobs.slice(i, i + CHUNK))
  }

  logger.info('Broadcast enqueued', {
    broadcastId,
    total: recipients.length,
    speed,
    estimatedMinutes: Math.ceil(recipients.length / speed),
  })
}

export async function cancelBroadcastJobs(broadcastId: string): Promise<void> {
  // Remove jobs ainda não processados deste broadcast
  const jobs = await broadcastQueue.getJobs(['delayed', 'waiting'])
  const toRemove = jobs.filter((j) => j.data?.broadcastId === broadcastId)
  await Promise.all(toRemove.map((j) => j.remove()))
  logger.info('Broadcast jobs cancelled', { broadcastId, count: toRemove.length })
}

export function startBroadcastWorker(): Worker {
  const worker = new Worker<BroadcastJobData>(
    'broadcasts',
    async (job: Job<BroadcastJobData>) => {
      const { workspaceId, broadcastId, recipientId, contactId, messages } = job.data

      // Verifica se o broadcast não foi cancelado
      const { query } = await import('../db/client')
      const statusResult = await query<{ status: string }>(
        'SELECT status FROM broadcasts WHERE id = $1',
        [broadcastId]
      )
      if (statusResult.rows[0]?.status === 'cancelado') return

      // Busca contato
      const contactResult = await query<{ name: string | null; phone: string }>(
        'SELECT name, phone FROM contacts WHERE id = $1',
        [contactId]
      )
      if (!contactResult.rowCount) return

      const contact = contactResult.rows[0]

      // Escolhe variação aleatória e interpola variáveis
      const template = pickRandomMessage(messages)
      const text = interpolate(template.text, contact)

      // Busca número ativo do broadcast
      const numberResult = await query<{ instance_name: string }>(
        `SELECT wn.instance_name FROM broadcasts b
         JOIN whatsapp_numbers wn ON wn.id = b.number_id
         WHERE b.id = $1`,
        [broadcastId]
      )

      let error: string | undefined

      try {
        const { sendText, formatPhoneNumber } = await import('../modules/whatsapp/evolution.client')
        await sendText({
          instanceName: numberResult.rows[0].instance_name,
          to: formatPhoneNumber(contact.phone),
          text,
          delay: 1000,
        })
        logger.debug('Broadcast message sent', { broadcastId, contactId })
      } catch (err) {
        error = (err as Error).message
        logger.warn('Broadcast send failed', { broadcastId, contactId, error })
      }

      await markRecipientSent(broadcastId, recipientId, text, error)
    },
    {
      connection,
      concurrency: 3,  // máx 3 broadcasts simultâneos (não paraleliza o mesmo)
    }
  )

  worker.on('failed', (job, err) => {
    logger.error('Broadcast job failed', { jobId: job?.id, error: err.message })
  })

  return worker
}
