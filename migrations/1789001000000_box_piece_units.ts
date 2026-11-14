import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

/**
 * Box and piece units. Stock stays counted in pieces, so existing rows keep their meaning:
 * every product starts at one piece per box and every existing line is a piece line.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const has = (table: string, column: string): boolean =>
    tables.find((value) => value.name === table)?.columns.some((value) => value.name === column) ??
    false
  if (!has('drugs', 'pieces_per_box'))
    await sql`ALTER TABLE drugs ADD COLUMN pieces_per_box INTEGER NOT NULL DEFAULT 1 CHECK (pieces_per_box BETWEEN 1 AND 10000)`.execute(
      db
    )
  if (!has('batches', 'box_sell_price'))
    await sql`ALTER TABLE batches ADD COLUMN box_sell_price REAL CHECK (box_sell_price IS NULL OR box_sell_price >= 0)`.execute(
      db
    )
  for (const table of ['purchase_order_items', 'sale_items', 'wholesale_order_items']) {
    if (!has(table, 'unit'))
      await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN unit TEXT NOT NULL DEFAULT 'piece' CHECK (unit IN ('piece', 'box'))`.execute(
        db
      )
    if (!has(table, 'pieces_per_unit'))
      await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN pieces_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (pieces_per_unit >= 1)`.execute(
        db
      )
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const table of ['purchase_order_items', 'sale_items', 'wholesale_order_items']) {
    await sql`ALTER TABLE ${sql.table(table)} DROP COLUMN pieces_per_unit`.execute(db)
    await sql`ALTER TABLE ${sql.table(table)} DROP COLUMN unit`.execute(db)
  }
  await sql`ALTER TABLE batches DROP COLUMN box_sell_price`.execute(db)
  await sql`ALTER TABLE drugs DROP COLUMN pieces_per_box`.execute(db)
}
