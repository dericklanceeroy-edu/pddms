import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
	await sql`
		CREATE TABLE batches (
			id 				INTEGER PRIMARY KEY AUTOINCREMENT,
			drug_id 		INTEGER NOT NULL,
			supplier_id 	INTEGER NOT NULL,
			physical_tag	TEXT UNIQUE,
			is_active		INTEGER NOT NULL,
			buy_price 		REAL NOT NULL,
			sell_price 		REAL NOT NULL,
			initial_stock 	INTEGER NOT NULL,
			current_stock 	INTEGER NOT NULL,
			expires_at 		TEXT NOT NULL,

			FOREIGN KEY (drug_id) REFERENCES drugs(id),
			FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
		);
	`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`DROP TABLE batches;`.execute(db)
}
