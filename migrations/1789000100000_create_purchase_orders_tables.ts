import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('purchase_orders')
    .ifNotExists()
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('supplier_id', 'integer', (column) =>
      column.notNull().references('suppliers.id').onDelete('restrict')
    )
    .addColumn('order_number', 'text', (column) => column.notNull().unique())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('draft'))
    .addColumn('ordered_at', 'text', (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('expected_at', 'text')
    .addColumn('received_at', 'text')
    .addColumn('notes', 'text')
    .addColumn('total_amount', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('created_by', 'integer', (column) =>
      column.notNull().references('accounts.id').onDelete('restrict')
    )
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'text', (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()

  await db.schema
    .createTable('purchase_order_items')
    .ifNotExists()
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('purchase_order_id', 'integer', (column) =>
      column.notNull().references('purchase_orders.id').onDelete('cascade')
    )
    .addColumn('drug_id', 'integer', (column) =>
      column.notNull().references('drugs.id').onDelete('restrict')
    )
    .addColumn('quantity', 'integer', (column) => column.notNull())
    .addColumn('unit_cost', 'real', (column) => column.notNull())
    .addColumn('received_quantity', 'integer', (column) => column.notNull().defaultTo(0))
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('purchase_order_items').ifExists().execute()
  await db.schema.dropTable('purchase_orders').ifExists().execute()
}
