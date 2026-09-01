import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const accounts = tables.find((table) => table.name === 'accounts')
  const drugs = tables.find((table) => table.name === 'drugs')

  if (!accounts?.columns.some((column) => ['fullName', 'full_name'].includes(column.name))) {
    await db.schema
      .alterTable('accounts')
      .addColumn('full_name', 'text', (column) => column.notNull().defaultTo(''))
      .execute()
    await sql`update accounts set full_name = username where full_name = ''`.execute(db)
  }
  if (!accounts?.columns.some((column) => ['isVerified', 'is_verified'].includes(column.name))) {
    await db.schema
      .alterTable('accounts')
      .addColumn('is_verified', 'integer', (column) => column.notNull().defaultTo(1))
      .execute()
  }
  if (!drugs?.columns.some((column) => ['reorderLevel', 'reorder_level'].includes(column.name))) {
    await db.schema
      .alterTable('drugs')
      .addColumn('reorder_level', 'integer', (column) => column.notNull().defaultTo(10))
      .execute()
  }
  if (!drugs?.columns.some((column) => ['isArchived', 'is_archived'].includes(column.name))) {
    await db.schema
      .alterTable('drugs')
      .addColumn('is_archived', 'integer', (column) => column.notNull().defaultTo(0))
      .execute()
  }

  if (!tables.some((table) => table.name === 'customers')) {
    await db.schema
      .createTable('customers')
      .addColumn('id', 'integer', (column) => column.primaryKey().autoIncrement())
      .addColumn('full_name', 'text', (column) => column.notNull())
      .addColumn('phone', 'text', (column) => column.notNull())
      .addColumn('email', 'text')
      .addColumn('address', 'text')
      .addColumn('discount_type', 'text', (column) => column.notNull().defaultTo('none'))
      .addColumn('discount_id', 'text')
      .addColumn('discount_expires_at', 'text')
      .addColumn('created_at', 'text', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .addColumn('updated_at', 'text', (column) =>
        column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .execute()
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('customers').ifExists().execute()
}
