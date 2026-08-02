import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT NOT NULL UNIQUE,
        password    TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_users_before_update_of_created_at
    BEFORE UPDATE OF created_at ON users
    FOR EACH ROW
    BEGIN
        SELECT RAISE(ABORT, 'read-only');
    END;
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_users_after_update
    AFTER UPDATE ON users
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
    BEGIN
        UPDATE users
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.id;
    END;
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE users;`.execute(db)
}
