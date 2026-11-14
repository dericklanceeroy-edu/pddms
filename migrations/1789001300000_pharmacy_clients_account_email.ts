import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

/**
 * Adds an email address to accounts and separates pharmacy (wholesale) clients from retail
 * customers. Only columns are added: every existing account keeps working without an email, and
 * every existing customer stays a retail customer until it is changed to a pharmacy client.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables()
  const has = (table: string, column: string): boolean =>
    !!tables.find((item) => item.name === table)?.columns.some((item) => item.name === column)
  if (!has('accounts', 'email')) await sql`ALTER TABLE accounts ADD COLUMN email TEXT`.execute(db)
  if (!has('customers', 'client_type'))
    await sql`ALTER TABLE customers ADD COLUMN client_type TEXT NOT NULL DEFAULT 'retail' CHECK(client_type IN ('retail','pharmacy'))`.execute(
      db
    )
  if (!has('customers', 'contact_person'))
    await sql`ALTER TABLE customers ADD COLUMN contact_person TEXT`.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE customers DROP COLUMN contact_person`.execute(db)
  await sql`ALTER TABLE customers DROP COLUMN client_type`.execute(db)
  await sql`ALTER TABLE accounts DROP COLUMN email`.execute(db)
}
