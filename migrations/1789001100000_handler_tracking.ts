import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

/**
 * Records who handled each incoming and outgoing step. Earlier rows keep NULL here because
 * the person was never captured; the screens show "Not recorded" for them.
 */
const columns: Array<[table: string, column: string, definition: string]> = [
  ['purchase_orders', 'submitted_by', 'INTEGER REFERENCES accounts(id) ON DELETE RESTRICT'],
  ['purchase_orders', 'submitted_at', 'TEXT'],
  ['purchase_orders', 'cancelled_by', 'INTEGER REFERENCES accounts(id) ON DELETE RESTRICT'],
  ['purchase_orders', 'cancelled_at', 'TEXT'],
  ['supplier_deliveries', 'delivered_by_name', 'TEXT'],
  ['supplier_deliveries', 'checked_by_name', 'TEXT'],
  ['wholesale_orders', 'scheduled_by_name', 'TEXT'],
  ['wholesale_orders', 'scheduled_at', 'TEXT'],
  ['wholesale_orders', 'driver_name', 'TEXT'],
  ['wholesale_orders', 'received_by_name', 'TEXT'],
  ['wholesale_orders', 'cancelled_by_name', 'TEXT'],
  ['wholesale_orders', 'cancelled_at', 'TEXT']
]

export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  for (const [table, column, definition] of columns) {
    const exists = tables
      .find((value) => value.name === table)
      ?.columns.some((value) => value.name === column)
    if (!exists)
      await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN ${sql.raw(column)} ${sql.raw(definition)}`.execute(
        db
      )
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const [table, column] of [...columns].reverse())
    await sql`ALTER TABLE ${sql.table(table)} DROP COLUMN ${sql.raw(column)}`.execute(db)
}
