import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE suppliers (
      id                INTEGER NOT NULL AUTOINCREMENT,
      organization      TEXT NOT NULL,
      contact_person    TEXT NOT NULL,
      phone_number      TEXT NOT NULL,
      telephone_number  TEXT,
      email_address     TEXT,
      street            TEXT NOT NULL,
      city              TEXT NOT NULL,
      province          TEXT NOT NULL,
      country           TEXT NOT NULL,
      postal_code       TEXT NOT NULL
    );
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE suppliers;`.execute(db)
}
