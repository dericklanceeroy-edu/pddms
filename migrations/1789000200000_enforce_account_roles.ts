import { sql, type Kysely } from 'kysely'
import type { Database } from '../src/shared/types'

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    create trigger if not exists accounts_role_validate_insert
    before insert on accounts
    when new.role not in ('master', 'staff', 'cashier')
    begin
      select raise(abort, 'Invalid account role');
    end
  `.execute(db)
  await sql`
    create trigger if not exists accounts_role_validate_update
    before update of role on accounts
    when new.role not in ('master', 'staff', 'cashier')
    begin
      select raise(abort, 'Invalid account role');
    end
  `.execute(db)
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`drop trigger if exists accounts_role_validate_insert`.execute(db)
  await sql`drop trigger if exists accounts_role_validate_update`.execute(db)
}
