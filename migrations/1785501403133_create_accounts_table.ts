import { Kysely, sql } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('role', 'text', (col) =>
      col.notNull().check(sql`role IN ('master', 'staff', 'cashier')`)
    )
    .addColumn('username', 'text', (col) => col.notNull().unique())
    .addColumn('full_name', 'text', (col) => col.notNull())
    .addColumn('password', 'text', (col) => col.notNull())
    .addColumn('is_archived', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('is_verified', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('accounts').execute()
}
