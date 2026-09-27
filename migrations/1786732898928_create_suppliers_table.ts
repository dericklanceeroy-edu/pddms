import type { Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('suppliers')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('organization', 'text', (col) => col.notNull())
    .addColumn('person', 'text', (col) => col.notNull())
    .addColumn('phone', 'text', (col) => col.notNull())
    .addColumn('telephone', 'text')
    .addColumn('email', 'text')
    .addColumn('street', 'text', (col) => col.notNull())
    .addColumn('city', 'text', (col) => col.notNull())
    .addColumn('province', 'text', (col) => col.notNull())
    .addColumn('country', 'text', (col) => col.notNull())
    .addColumn('postal_code', 'text', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('suppliers').execute()
}
