import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const columns = new Set(
    tables.find((table) => table.name === 'accounts')?.columns.map((column) => column.name)
  )
  if (!columns.has('failed_attempts'))
    await sql`ALTER TABLE accounts ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0)`.execute(
      db
    )
  if (!columns.has('last_failed_at'))
    await sql`ALTER TABLE accounts ADD COLUMN last_failed_at TEXT`.execute(db)
  if (!columns.has('locked_until'))
    await sql`ALTER TABLE accounts ADD COLUMN locked_until TEXT`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
    actor_id INTEGER, actor_name TEXT NOT NULL, action TEXT NOT NULL,
    resource TEXT NOT NULL, target_id INTEGER, result TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS audit_logs_date ON audit_logs(created_at, id)`.execute(db)
}
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('auditLogs').ifExists().execute()
  await sql`ALTER TABLE accounts DROP COLUMN failed_attempts`.execute(db)
  await sql`ALTER TABLE accounts DROP COLUMN last_failed_at`.execute(db)
  await sql`ALTER TABLE accounts DROP COLUMN locked_until`.execute(db)
}
