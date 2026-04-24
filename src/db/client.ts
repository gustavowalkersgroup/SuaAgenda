import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { env } from '../config/env'
import { logger } from '../config/logger'

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error', { error: err.message })
})

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now()
  const result = await pool.query<T>(text, params)
  const duration = Date.now() - start

  if (env.NODE_ENV === 'development' && duration > 200) {
    logger.debug('Slow query', { text, duration, rows: result.rowCount })
  }

  return result
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect()
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function checkConnection(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
    logger.info('Database connected')
  } finally {
    client.release()
  }
}

export default pool
