import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('stock_outs')
    .ifNotExists()
    .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
    .addColumn('batch_id', 'integer', (column) =>
      column.notNull().references('batches.id').onDelete('restrict')
    )
    .addColumn('quantity', 'integer', (column) => column.notNull().check(sql`quantity > 0`))
    .addColumn('reason', 'text', (column) => column.notNull())
    .addColumn('recorded_by', 'integer', (column) =>
      column.notNull().references('accounts.id').onDelete('restrict')
    )
    .addColumn('created_at', 'text', (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('stock_outs').ifExists().execute()
}
