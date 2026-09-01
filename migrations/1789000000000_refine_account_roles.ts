import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    update accounts
    set role = 'staff'
    where role = 'manager' or role not in ('master', 'staff', 'cashier')
  `.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  void db
  // Role normalization is intentionally irreversible.
}
