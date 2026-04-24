import { createClient } from 'redis'
import { env } from '../config/env'
import { logger } from '../config/logger'

export const redis = createClient({ url: env.REDIS_URL })

redis.on('error', (err) => logger.error('Redis error', { error: err.message }))
redis.on('connect', () => logger.info('Redis connected'))

export async function connectRedis(): Promise<void> {
  await redis.connect()
}
