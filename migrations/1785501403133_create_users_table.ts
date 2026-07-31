import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'serial', (b) => b.primaryKey())
    .addColumn('username', 'text', (b) => b.notNull().unique())
    .addColumn('password', 'text', (b) => b.notNull())
    .addColumn('created_at', 'text', (b) => b.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'text', (b) => b.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('users').execute()
}
