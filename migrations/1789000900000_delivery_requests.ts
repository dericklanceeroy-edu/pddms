import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const columns = tables.find((table) => table.name === 'supplier_deliveries')?.columns ?? []
  if (!columns.some((column) => column.name === 'request_id'))
    await sql`ALTER TABLE supplier_deliveries ADD COLUMN request_id TEXT`.execute(db)
  if (!columns.some((column) => column.name === 'request_fingerprint'))
    await sql`ALTER TABLE supplier_deliveries ADD COLUMN request_fingerprint TEXT`.execute(db)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS supplier_deliveries_request ON supplier_deliveries(request_id)`.execute(
    db
  )
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS supplier_deliveries_request`.execute(db)
  await sql`ALTER TABLE supplier_deliveries DROP COLUMN request_fingerprint`.execute(db)
  await sql`ALTER TABLE supplier_deliveries DROP COLUMN request_id`.execute(db)
}
