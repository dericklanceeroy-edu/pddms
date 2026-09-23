import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS wholesale_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE, request_fingerprint TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL, order_date TEXT NOT NULL, due_date TEXT NOT NULL,
    total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
    status TEXT NOT NULL CHECK(status IN ('pending','scheduled','delivered','cancelled')),
    notes TEXT NOT NULL, scheduled_date TEXT, delivery_address TEXT NOT NULL,
    delivery_notes TEXT NOT NULL, delivered_at TEXT, delivered_by_name TEXT,
    CHECK(status != 'scheduled' OR scheduled_date IS NOT NULL),
    CHECK(status != 'delivered' OR (delivered_at IS NOT NULL AND delivered_by_name IS NOT NULL))
  )`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS wholesale_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES wholesale_orders(id) ON DELETE RESTRICT,
    drug_id INTEGER NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL, category TEXT NOT NULL, batch_number TEXT NOT NULL,
    expires_at TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0), UNIQUE(order_id, batch_id)
  )`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS wholesale_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES wholesale_orders(id) ON DELETE RESTRICT,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    paid_at TEXT NOT NULL, reference TEXT NOT NULL COLLATE NOCASE UNIQUE,
    method TEXT NOT NULL, notes TEXT NOT NULL,
    recorded_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    updated_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT
  )`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS wholesale_orders_customer ON wholesale_orders(customer_id)`.execute(
    db
  )
  await sql`CREATE INDEX IF NOT EXISTS wholesale_orders_status_due ON wholesale_orders(status, due_date)`.execute(
    db
  )
  await sql`CREATE INDEX IF NOT EXISTS wholesale_payments_order ON wholesale_payments(order_id)`.execute(
    db
  )
}
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('wholesalePayments').ifExists().execute()
  await db.schema.dropTable('wholesaleOrderItems').ifExists().execute()
  await db.schema.dropTable('wholesaleOrders').ifExists().execute()
}
