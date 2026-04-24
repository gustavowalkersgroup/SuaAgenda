import fs from 'fs'
import path from 'path'
import { query, checkConnection } from './client'
import { logger } from '../config/logger'

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function getAppliedMigrations(): Promise<string[]> {
  const result = await query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version'
  )
  return result.rows.map((r) => r.version)
}

async function runMigrations(): Promise<void> {
  await checkConnection()
  await ensureMigrationsTable()

  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const applied = await getAppliedMigrations()

  for (const file of files) {
    const version = file.replace('.sql', '')

    if (applied.includes(version)) {
      logger.debug(`Migration already applied: ${version}`)
      continue
    }

    logger.info(`Applying migration: ${version}`)
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')

    await query('BEGIN')
    try {
      await query(sql)
      await query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
      await query('COMMIT')
      logger.info(`Migration applied: ${version}`)
    } catch (err) {
      await query('ROLLBACK')
      throw err
    }
  }

  logger.info('All migrations applied')
  process.exit(0)
}

runMigrations().catch((err) => {
  logger.error('Migration failed', { error: err.message })
  process.exit(1)
})
