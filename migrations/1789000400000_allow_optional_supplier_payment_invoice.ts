import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

interface TableColumn {
  name: string
  notnull: number
}

export async function up(db: Kysely<Database>): Promise<void> {
  const columns = await sql<TableColumn>`PRAGMA table_info(supplier_payments)`.execute(db)
  const invoiceColumn = columns.rows.find((column) => column.name === 'invoice_id')
  if (!invoiceColumn || invoiceColumn.notnull === 0) return

  await db.transaction().execute(async (transaction) => {
    await sql`
      CREATE TABLE supplier_payments_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
        invoice_id INTEGER REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
        amount REAL NOT NULL,
        paid_at TEXT NOT NULL,
        method TEXT NOT NULL,
        reference_number TEXT UNIQUE,
        notes TEXT,
        recorded_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(transaction)
    await sql`
      INSERT INTO supplier_payments_next (
        id, supplier_id, purchase_order_id, invoice_id, amount, paid_at,
        method, reference_number, notes, recorded_by, created_at
      )
      SELECT
        id, supplier_id, purchase_order_id, invoice_id, amount, paid_at,
        method, reference_number, notes, recorded_by, created_at
      FROM supplier_payments
    `.execute(transaction)
    await sql`DROP TABLE supplier_payments`.execute(transaction)
    await sql`ALTER TABLE supplier_payments_next RENAME TO supplier_payments`.execute(transaction)
  })
}

export async function down(db: Kysely<Database>): Promise<void> {
  const missingInvoice = await db
    .selectFrom('supplierPayments')
    .select('id')
    .where('invoiceId', 'is', null)
    .executeTakeFirst()
  if (missingInvoice) {
    throw new Error('Cannot require invoices while invoice-less supplier payments exist.')
  }
}
