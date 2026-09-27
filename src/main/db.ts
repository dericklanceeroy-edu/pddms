import { env, legacyDatabase } from '@main/env'
import type { Database } from '@shared/types'
import SQLite from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

mkdirSync(dirname(resolve(env.DATABASE)), { recursive: true })
if (
  legacyDatabase &&
  legacyDatabase !== resolve(env.DATABASE) &&
  !existsSync(env.DATABASE) &&
  existsSync(legacyDatabase)
) {
  const legacy = new SQLite(legacyDatabase, { readonly: true, fileMustExist: true })
  try {
    // Note: Preserve the legacy file while copying a consistent snapshot.
    legacy.prepare('VACUUM INTO ?').run(resolve(env.DATABASE))
  } finally {
    legacy.close()
  }
}

export const database = new SQLite(env.DATABASE)
database.pragma('foreign_keys = ON')

export const dialect = new SqliteDialect({
  database
})

export const db = new Kysely<Database>({
  dialect,
  plugins: [new CamelCasePlugin()]
})
