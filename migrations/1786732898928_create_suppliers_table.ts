import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE suppliers (
      id              INTEGER NOT NULL AUTOINCREMENT,
      organization    TEXT NOT NULL,
      contactPerson   TEXT NOT NULL,
      phoneNumber     TEXT NOT NULL,
      telephoneNumber TEXT,
      emailAddress    TEXT,
      street          TEXT NOT NULL,
      city            TEXT NOT NULL,
      province        TEXT NOT NULL,
      country         TEXT NOT NULL,
      postalCode      TEXT NOT NULL
    );
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE suppliers;`.execute(db)
}
