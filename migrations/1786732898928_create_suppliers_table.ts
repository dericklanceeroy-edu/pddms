import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('suppliers')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('organization', 'text', (col) => col.notNull())
    .addColumn('contact_person', 'text', (col) => col.notNull())
    .addColumn('phone_number', 'text', (col) => col.notNull())
    .addColumn('telephone_number', 'text')
    .addColumn('email_address', 'text')
    .addColumn('street', 'text', (col) => col.notNull())
    .addColumn('city', 'text', (col) => col.notNull())
    .addColumn('province', 'text', (col) => col.notNull())
    .addColumn('country', 'text', (col) => col.notNull())
    .addColumn('postal_code', 'text', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('suppliers').execute()
}
