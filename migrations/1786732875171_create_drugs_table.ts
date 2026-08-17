import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
	CREATE TABLE drugs (
		id 				INTEGER PRIMARY KEY AUTOINCREMENT,
		category		TEXT NOT NULL,
		generic_name 	TEXT NOT NULL,
		brand_name 		TEXT NOT NULL,
		formulation		TEXT NOT NULL,
		is_prescribed	INTEGER NOT NULL,
		is_controlled	INTEGER NOT NULL
	);
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE drugs;`.execute(db)
}
