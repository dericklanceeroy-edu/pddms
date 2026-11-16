import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

/**
 * Second November 15 QA pass. Only nullable columns are added, so the live database and older
 * backups being restored upgrade the same way and nothing is rewritten:
 *
 * - M1: each stock count line keeps the system stock at the moment its count was entered, so a
 *   sale made during the count is not subtracted twice. Lines saved before the upgrade have none
 *   and fall back to the stock expected when the count started (the old behaviour).
 * - M3: a void records whether the medicines came back to the counter. Older voids have none and
 *   are read as returned, which is what the earlier version did.
 * - M4: a GCash or Maya reference must be unique among completed sales only, so a voided sale's
 *   reference can be rung up again correctly. The index keeps its name, so the earlier step that
 *   creates it if missing leaves this version alone.
 * - L2: a cash count saved again for the same cashier and day points to the count it replaces.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const has = (table: string, column: string): boolean =>
    !!tables.find((item) => item.name === table)?.columns.some((item) => item.name === column)
  const add = async (table: string, column: string, definition: string): Promise<void> => {
    if (!tables.some((item) => item.name === table) || has(table, column)) return
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).execute(db)
  }
  await add(
    'stock_count_lines',
    'stock_at_count',
    'INTEGER CHECK (stock_at_count IS NULL OR stock_at_count >= 0)'
  )
  await add(
    'sales',
    'void_items_returned',
    'INTEGER CHECK (void_items_returned IS NULL OR void_items_returned IN (0, 1))'
  )
  await add('cash_counts', 'recount_of', 'INTEGER REFERENCES cash_counts(id)')

  const index = await sql<{ sql: string | null }>`SELECT sql FROM sqlite_master
    WHERE type = 'index' AND name = 'sales_payment_reference'`.execute(db)
  if (has('sales', 'status') && !/status/.test(index.rows[0]?.sql ?? '')) {
    await sql`DROP INDEX IF EXISTS sales_payment_reference`.execute(db)
    await sql`CREATE UNIQUE INDEX sales_payment_reference ON sales(payment_method, payment_reference)
      WHERE payment_reference IS NOT NULL AND status = 'completed'`.execute(db)
  }
}

export async function down(): Promise<void> {
  // Note: Added columns are left in place; SQLite drops columns only by rebuilding the table.
}
