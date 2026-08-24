import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('batches')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('drug_id', 'integer', (col) => col.notNull().references('drugs.id').onDelete("restrict"))
    .addColumn('supplier_id', 'integer', (col) => col.notNull().references('suppliers.id').onDelete("restrict"))
    .addColumn('physical_tag', 'text', (col) => col.unique())
    .addColumn('buy_price', 'real', (col) => col.notNull())
    .addColumn('sell_price', 'real', (col) => col.notNull())
    .addColumn('initial_stock', 'integer', (col) => col.notNull())
    .addColumn('current_stock', 'integer', (col) => col.notNull())
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('batches').execute()
}
