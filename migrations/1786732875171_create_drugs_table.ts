import type { Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('drugs')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('generic_name', 'text', (col) => col.notNull())
    .addColumn('brand_name', 'text', (col) => col.notNull())
    .addColumn('formulation', 'text', (col) => col.notNull())
    .addColumn('is_prescribed', 'integer', (col) => col.notNull())
    .addColumn('is_controlled', 'integer', (col) => col.notNull())
    .addColumn('reorder_level', 'integer', (col) => col.notNull().defaultTo(10))
    .addColumn('is_archived', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('drugs').execute()
}
