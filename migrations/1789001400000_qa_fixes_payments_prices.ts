import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

/**
 * Adds counter e-wallet payments, prescription details on sales, a separate wholesale box price,
 * account phone numbers and the last agreed supplier cost per product. Wholesale orders placed
 * for retail customers by an older version are voided when unpaid and undelivered; the others
 * are kept and flagged for review. Sale lines become unique per batch and unit (one table copy).
 */
export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const has = (table: string, column: string): boolean =>
    !!tables.find((item) => item.name === table)?.columns.some((item) => item.name === column)
  const columns: Array<[string, string, string]> = [
    ['sales', 'payment_method', "TEXT NOT NULL DEFAULT 'Cash'"],
    ['sales', 'payment_reference', 'TEXT'],
    ['sales', 'prescriber_name', 'TEXT'],
    ['sales', 'prescriber_license', 'TEXT'],
    ['sales', 'prescription_number', 'TEXT'],
    ['batches', 'wholesale_box_price', 'REAL'],
    ['accounts', 'phone', 'TEXT'],
    ['wholesale_orders', 'review_note', 'TEXT']
  ]
  for (const [table, column, definition] of columns)
    if (!has(table, column))
      await sql
        .raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
        .execute(db)
  await allowBoxAndPiecesPerSale(db)
  await sql`CREATE TABLE IF NOT EXISTS supplier_product_costs (
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    drug_id INTEGER NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
    unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (supplier_id, drug_id)
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_payment_reference
    ON sales(payment_method, payment_reference) WHERE payment_reference IS NOT NULL`.execute(db)
  // Note: Seed default costs from the latest order line of each supplier and product.
  await sql`INSERT OR IGNORE INTO supplier_product_costs (supplier_id, drug_id, unit_cost)
    SELECT po.supplier_id, poi.drug_id, poi.unit_cost FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.status != 'cancelled' ORDER BY poi.id DESC`.execute(db)
  // Note: Orders for retail customers predate the pharmacy-client rule.
  await sql`UPDATE wholesale_orders SET status = 'cancelled',
      cancelled_by_name = 'System (order was for a retail customer)',
      cancelled_at = ${new Date().toISOString()},
      review_note = 'Voided: placed for a retail customer before wholesale was limited to pharmacy clients.'
    WHERE status IN ('pending','scheduled')
      AND customer_id IN (SELECT id FROM customers WHERE client_type = 'retail')
      AND NOT EXISTS (SELECT 1 FROM wholesale_payments p WHERE p.order_id = wholesale_orders.id)`.execute(
    db
  )
  await sql`UPDATE wholesale_orders
    SET review_note = 'Retail customer: placed before wholesale was limited to pharmacy clients. Review this order.'
    WHERE review_note IS NULL
      AND customer_id IN (SELECT id FROM customers WHERE client_type = 'retail')`.execute(db)
}

/**
 * A sale may hold a box and loose pieces of the same batch, so a sale line is unique per batch and
 * unit. SQLite cannot change a table constraint in place, so the table is copied once with the
 * wider rule; nothing references sale lines by id. Runs only while the old rule is present.
 */
async function allowBoxAndPiecesPerSale(db: Kysely<Database>): Promise<void> {
  const oldRule = /UNIQUE\s*\(\s*sale_id\s*,\s*batch_id\s*\)/i
  const table = await sql<{ sql: string }>`SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'sale_items'`.execute(db)
  const definition = table.rows[0]?.sql
  if (!definition || !oldRule.test(definition)) return
  const columns = (await sql<{ name: string }>`PRAGMA table_info(sale_items)`.execute(db)).rows
    .map((column) => `"${column.name}"`)
    .join(', ')
  const next = definition
    .replace(/^CREATE TABLE\s+("?sale_items"?|sale_items)/i, 'CREATE TABLE sale_items_next')
    .replace(oldRule, 'UNIQUE(sale_id, batch_id, unit)')
  await db.transaction().execute(async (transaction) => {
    await sql.raw(next).execute(transaction)
    await sql
      .raw(`INSERT INTO sale_items_next (${columns}) SELECT ${columns} FROM sale_items`)
      .execute(transaction)
    await sql`DROP TABLE sale_items`.execute(transaction)
    await sql`ALTER TABLE sale_items_next RENAME TO sale_items`.execute(transaction)
  })
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS supplier_product_costs`.execute(db)
}
