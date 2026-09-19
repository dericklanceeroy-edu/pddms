import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('supplier_deliveries')
    .ifNotExists()
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('purchase_order_id', 'integer', (column) =>
      column.notNull().references('purchase_orders.id').onDelete('restrict')
    )
    .addColumn('supplier_id', 'integer', (column) =>
      column.notNull().references('suppliers.id').onDelete('restrict')
    )
    .addColumn('delivered_at', 'text', (column) => column.notNull())
    .addColumn('notes', 'text')
    .addColumn('recorded_by', 'integer', (column) =>
      column.notNull().references('accounts.id').onDelete('restrict')
    )
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()

  await db.schema
    .createTable('supplier_delivery_items')
    .ifNotExists()
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('delivery_id', 'integer', (column) =>
      column.notNull().references('supplier_deliveries.id').onDelete('cascade')
    )
    .addColumn('purchase_order_item_id', 'integer', (column) =>
      column.notNull().references('purchase_order_items.id').onDelete('restrict')
    )
    .addColumn('drug_id', 'integer', (column) =>
      column.notNull().references('drugs.id').onDelete('restrict')
    )
    .addColumn('batch_id', 'integer', (column) =>
      column.notNull().references('batches.id').onDelete('restrict')
    )
    .addColumn('quantity', 'integer', (column) => column.notNull())
    .execute()

  await db.schema
    .createTable('supplier_invoices')
    .ifNotExists()
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('supplier_id', 'integer', (column) =>
      column.notNull().references('suppliers.id').onDelete('restrict')
    )
    .addColumn('purchase_order_id', 'integer', (column) =>
      column.notNull().references('purchase_orders.id').onDelete('restrict')
    )
    .addColumn('invoice_number', 'text', (column) => column.notNull())
    .addColumn('invoice_date', 'text', (column) => column.notNull())
    .addColumn('due_date', 'text', (column) => column.notNull())
    .addColumn('amount', 'real', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('unpaid'))
    .addColumn('original_filename', 'text', (column) => column.notNull())
    .addColumn('stored_filename', 'text', (column) => column.notNull().unique())
    .addColumn('mime_type', 'text', (column) => column.notNull())
    .addColumn('file_size', 'integer', (column) => column.notNull())
    .addColumn('uploaded_by', 'integer', (column) =>
      column.notNull().references('accounts.id').onDelete('restrict')
    )
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addUniqueConstraint('supplier_invoices_supplier_number_unique', [
      'supplier_id',
      'invoice_number'
    ])
    .execute()

  await db.schema
    .createTable('supplier_payments')
    .ifNotExists()
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('supplier_id', 'integer', (column) =>
      column.notNull().references('suppliers.id').onDelete('restrict')
    )
    .addColumn('purchase_order_id', 'integer', (column) =>
      column.notNull().references('purchase_orders.id').onDelete('restrict')
    )
    .addColumn('invoice_id', 'integer', (column) =>
      column.references('supplier_invoices.id').onDelete('restrict')
    )
    .addColumn('amount', 'real', (column) => column.notNull())
    .addColumn('paid_at', 'text', (column) => column.notNull())
    .addColumn('method', 'text', (column) => column.notNull())
    .addColumn('reference_number', 'text', (column) => column.unique())
    .addColumn('notes', 'text')
    .addColumn('recorded_by', 'integer', (column) =>
      column.notNull().references('accounts.id').onDelete('restrict')
    )
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('supplier_payments').ifExists().execute()
  await db.schema.dropTable('supplier_invoices').ifExists().execute()
  await db.schema.dropTable('supplier_delivery_items').ifExists().execute()
  await db.schema.dropTable('supplier_deliveries').ifExists().execute()
}
