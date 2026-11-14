import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

/**
 * Keeps the Senior/PWD ID expiry with each sale. A walk-in discount has no customer profile,
 * so the name, ID number and expiry checked at the counter live only on the sale.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const exists = tables
    .find((table) => table.name === 'sales')
    ?.columns.some((column) => column.name === 'discount_expires_at')
  if (!exists) await sql`ALTER TABLE sales ADD COLUMN discount_expires_at TEXT`.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE sales DROP COLUMN discount_expires_at`.execute(db)
}
