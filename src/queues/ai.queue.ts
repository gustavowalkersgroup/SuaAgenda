import { Queue, Worker } from 'bullmq'
import { env } from '../config/env'
import { logger } from '../config/logger'

const connection = { url: env.REDIS_URL }

export const aiQueue = new Queue('ai-agent', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 200,
  },
})

export interface AiJobData {
  workspaceId: string
  conversationId: string
  contactId: string
  contactPhone: string
  contactName: string | null
  inboundText: string
}

export async function enqueueAiMessage(data: AiJobData): Promise<void> {
  await aiQueue.add('process', data, {
    // Agrupa por conversa para processar sequencialmente por cliente
    jobId: `ai:${data.conversationId}:${Date.now()}`,
  })
}

export function startAiWorker(): Worker {
  const worker = new Worker<AiJobData>(
    'ai-agent',
    async (job) => {
      const { runAgent } = await import('../modules/ai/ai.agent')
      await runAgent(job.data)
    },
    {
      connection,
      concurrency: 5,     // até 5 conversas paralelas
      limiter: {
        max: 10,
        duration: 1000,   // máx 10 jobs/s (respeita rate limits da OpenAI)
      },
    }
  )

  worker.on('completed', (job) => {
    logger.debug('AI job completed', { jobId: job.id, conversationId: job.data.conversationId })
  })

  worker.on('failed', (job, err) => {
    logger.error('AI job failed', {
      jobId: job?.id,
      conversationId: job?.data.conversationId,
      error: err.message,
    })
  })

  return worker
}
