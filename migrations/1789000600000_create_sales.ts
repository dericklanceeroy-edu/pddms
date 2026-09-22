import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    reference TEXT NOT NULL UNIQUE,
    cashier_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    cashier_name TEXT NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    discount_id TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('none', 'senior', 'pwd')),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    vat_exemption_cents INTEGER NOT NULL CHECK (vat_exemption_cents >= 0),
    discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    cash_cents INTEGER NOT NULL CHECK (cash_cents >= total_cents),
    change_cents INTEGER NOT NULL CHECK (change_cents = cash_cents - total_cents),
    created_at TEXT NOT NULL,
    CHECK (total_cents = subtotal_cents - vat_exemption_cents - discount_cents)
  )`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    drug_id INTEGER NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    UNIQUE(sale_id, batch_id)
  )`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS sales_cashier_date ON sales(cashier_id, created_at)`.execute(
    db
  )
  await sql`CREATE INDEX IF NOT EXISTS sales_customer ON sales(customer_id)`.execute(db)
}
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('saleItems').ifExists().execute()
  await db.schema.dropTable('sales').ifExists().execute()
}
