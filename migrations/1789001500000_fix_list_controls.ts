import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

/**
 * Pharmacy controls from the November 15 fix list. Only tables and columns are added, so the
 * live database and older backups being restored upgrade the same way, and nothing is lost:
 *
 * - Supplier price list: pack sizes per supplier and product, each with a dated price history.
 *   Existing last-used costs are carried over as the first price of a pack with the product's old
 *   box size, so ordering keeps working until the owner reviews the list.
 * - Batches keep their own pieces per box (copied from the product for existing batches).
 * - Purchase order lines remember the pack; delivery lines keep the invoice cost and pieces per
 *   box that actually arrived, and the reason when they differ. Rejected (damaged) units are
 *   recorded per delivery without entering stock.
 * - Retail sales can be voided (status, who, approver, reason) and keep patient and prescriber
 *   details for the dangerous drugs register.
 * - Stock movements gain a kind and a fixed write-off reason; old free-text reasons stay as notes.
 * - Supplier returns, supplier credit notes, stock counts, stock adjustments and cash counts.
 * - Customers can be archived or merged and pharmacy clients get a TIN; audit entries keep the
 *   old and new values of a change.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const tableNames = new Set(tables.map((table) => table.name))
  const has = (table: string, column: string): boolean =>
    !!tables.find((item) => item.name === table)?.columns.some((item) => item.name === column)
  const add = async (table: string, column: string, definition: string): Promise<boolean> => {
    if (has(table, column)) return false
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).execute(db)
    return true
  }

  // Item 2/4: each batch keeps the box size it actually arrived in.
  if (
    await add(
      'batches',
      'pieces_per_box',
      'INTEGER NOT NULL DEFAULT 1 CHECK (pieces_per_box BETWEEN 1 AND 10000)'
    )
  )
    await sql`UPDATE batches SET pieces_per_box = COALESCE((SELECT pieces_per_box FROM drugs WHERE drugs.id = batches.drug_id), 1)`.execute(
      db
    )

  // Item 1/2: supplier price list.
  const newPriceList = !tableNames.has('supplier_packs')
  await sql`CREATE TABLE IF NOT EXISTS supplier_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    drug_id INTEGER NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    pieces_per_box INTEGER NOT NULL CHECK (pieces_per_box BETWEEN 1 AND 10000),
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (supplier_id, drug_id, pieces_per_box)
  )`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS supplier_pack_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id INTEGER NOT NULL REFERENCES supplier_packs(id) ON DELETE RESTRICT,
    unit_cost REAL NOT NULL CHECK (unit_cost > 0),
    effective_from TEXT NOT NULL,
    quotation_reference TEXT,
    recorded_by INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`.execute(db)
  await sql`CREATE INDEX IF NOT EXISTS supplier_pack_prices_pack ON supplier_pack_prices(pack_id, effective_from)`.execute(
    db
  )
  if (newPriceList && tableNames.has('supplier_product_costs')) {
    await sql`INSERT OR IGNORE INTO supplier_packs (supplier_id, drug_id, pieces_per_box)
      SELECT c.supplier_id, c.drug_id, MAX(1, d.pieces_per_box) FROM supplier_product_costs c
      JOIN drugs d ON d.id = c.drug_id`.execute(db)
    await sql`INSERT INTO supplier_pack_prices (pack_id, unit_cost, effective_from, quotation_reference)
      SELECT p.id, c.unit_cost, substr(c.updated_at, 1, 10), 'Carried over from the last purchase order'
      FROM supplier_product_costs c JOIN drugs d ON d.id = c.drug_id
      JOIN supplier_packs p ON p.supplier_id = c.supplier_id AND p.drug_id = c.drug_id AND p.pieces_per_box = MAX(1, d.pieces_per_box)
      WHERE c.unit_cost > 0`.execute(db)
  }
  // Note: Existing order lines are linked to the matching carried-over pack (same supplier,
  // product and box size), so an open draft can still be submitted after the upgrade.
  if (await add('purchase_order_items', 'pack_id', 'INTEGER REFERENCES supplier_packs(id)'))
    await sql`UPDATE purchase_order_items SET pack_id = (
      SELECT p.id FROM supplier_packs p JOIN purchase_orders o ON o.id = purchase_order_items.purchase_order_id
      WHERE p.supplier_id = o.supplier_id AND p.drug_id = purchase_order_items.drug_id
        AND p.pieces_per_box = purchase_order_items.pieces_per_unit)`.execute(db)

  // Item 1/2/13: what actually arrived.
  if (await add('supplier_delivery_items', 'unit_cost', 'REAL'))
    await sql`UPDATE supplier_delivery_items SET unit_cost = (SELECT unit_cost FROM purchase_order_items WHERE purchase_order_items.id = supplier_delivery_items.purchase_order_item_id)`.execute(
      db
    )
  if (await add('supplier_delivery_items', 'pieces_per_unit', 'INTEGER'))
    await sql`UPDATE supplier_delivery_items SET pieces_per_unit = (SELECT pieces_per_unit FROM purchase_order_items WHERE purchase_order_items.id = supplier_delivery_items.purchase_order_item_id)`.execute(
      db
    )
  await add('supplier_delivery_items', 'difference_reason', 'TEXT')
  await sql`CREATE TABLE IF NOT EXISTS supplier_delivery_rejections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id INTEGER NOT NULL REFERENCES supplier_deliveries(id) ON DELETE RESTRICT,
    purchase_order_item_id INTEGER NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
    drug_id INTEGER NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reason TEXT NOT NULL
  )`.execute(db)

  // Item 5/6/8: customers and pharmacy clients.
  await add('customers', 'is_archived', 'INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))')
  await add('customers', 'merged_into', 'INTEGER REFERENCES customers(id)')
  await add('customers', 'tin', 'TEXT')
  // Item 11: supplier licence for the register.
  await add('suppliers', 'pdea_license', 'TEXT')

  // Item 9/11: voids and register details on retail sales.
  await add(
    'sales',
    'status',
    "TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided'))"
  )
  await add('sales', 'voided_at', 'TEXT')
  await add('sales', 'voided_by', 'INTEGER REFERENCES accounts(id)')
  await add('sales', 'voided_by_name', 'TEXT')
  await add('sales', 'void_approved_by_name', 'TEXT')
  await add('sales', 'void_reason', 'TEXT')
  await add('sales', 'patient_age', 'INTEGER')
  await add('sales', 'patient_address', 'TEXT')
  await add('sales', 'prescriber_address', 'TEXT')
  await add('sales', 'prescriber_s2_license', 'TEXT')

  // Item 12: every stock movement out has a kind; write-offs have a fixed reason.
  if (
    await add(
      'stock_outs',
      'kind',
      "TEXT NOT NULL DEFAULT 'write_off' CHECK (kind IN ('sale', 'wholesale', 'write_off', 'supplier_return'))"
    )
  ) {
    await sql`UPDATE stock_outs SET kind = 'sale' WHERE reason LIKE 'Sale SALE-%'`.execute(db)
    await sql`UPDATE stock_outs SET kind = 'wholesale' WHERE reason LIKE 'Wholesale WHO-%'`.execute(
      db
    )
  }
  if (
    await add(
      'stock_outs',
      'reason_code',
      "TEXT CHECK (reason_code IS NULL OR reason_code IN ('expired', 'damaged', 'lost', 'recalled', 'other'))"
    )
  )
    await sql`UPDATE stock_outs SET reason_code = 'other' WHERE kind = 'write_off'`.execute(db)

  // Item 14: supplier returns and credit notes.
  await sql`CREATE TABLE IF NOT EXISTS supplier_credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    credit_note_number TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    applied_at TEXT,
    notes TEXT,
    recorded_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (supplier_id, credit_note_number)
  )`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS supplier_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    stock_out_id INTEGER NOT NULL REFERENCES stock_outs(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reason_code TEXT NOT NULL CHECK (reason_code IN ('near_expiry', 'expired', 'damaged', 'wrong_item', 'recalled', 'other')),
    notes TEXT,
    returned_at TEXT NOT NULL,
    credit_note_id INTEGER REFERENCES supplier_credit_notes(id) ON DELETE RESTRICT,
    recorded_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`.execute(db)

  // Item 16: stock counts and adjustments in both directions.
  await sql`CREATE TABLE IF NOT EXISTS stock_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
    drug_id INTEGER REFERENCES drugs(id) ON DELETE RESTRICT,
    notes TEXT,
    started_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    started_at TEXT NOT NULL,
    closed_by INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
    closed_at TEXT
  )`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS stock_count_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE RESTRICT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    expected INTEGER NOT NULL CHECK (expected >= 0),
    counted INTEGER CHECK (counted IS NULL OR counted >= 0),
    reason TEXT,
    UNIQUE (count_id, batch_id)
  )`.execute(db)
  await sql`CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    change INTEGER NOT NULL CHECK (change != 0),
    reason TEXT NOT NULL,
    count_id INTEGER REFERENCES stock_counts(id) ON DELETE RESTRICT,
    recorded_by INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL
  )`.execute(db)

  // Item 17: end-of-day cash count.
  await sql`CREATE TABLE IF NOT EXISTS cash_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cashier_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    cashier_name TEXT NOT NULL,
    business_date TEXT NOT NULL,
    opening_float_cents INTEGER NOT NULL CHECK (opening_float_cents >= 0),
    cash_sales_cents INTEGER NOT NULL CHECK (cash_sales_cents >= 0),
    cash_sales_count INTEGER NOT NULL CHECK (cash_sales_count >= 0),
    expected_cents INTEGER NOT NULL,
    counted_cents INTEGER NOT NULL CHECK (counted_cents >= 0),
    difference_cents INTEGER NOT NULL,
    denominations TEXT NOT NULL,
    notes TEXT,
    counted_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`.execute(db)

  // Item 15: old and new values of a change.
  await add('audit_logs', 'details', 'TEXT')
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const table of [
    'cash_counts',
    'stock_adjustments',
    'stock_count_lines',
    'stock_counts',
    'supplier_returns',
    'supplier_credit_notes',
    'supplier_delivery_rejections',
    'supplier_pack_prices',
    'supplier_packs'
  ])
    await sql.raw(`DROP TABLE IF EXISTS ${table}`).execute(db)
}
