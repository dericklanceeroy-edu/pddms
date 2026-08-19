import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('drugs')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('generic_name', 'text', (col) => col.notNull())
    .addColumn('brand_name', 'text', (col) => col.notNull())
    .addColumn('formulation', 'text', (col) => col.notNull())
    .addColumn('is_prescribed', 'integer', (col) => col.notNull())
    .addColumn('is_controlled', 'integer', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('drugs').execute()
}
