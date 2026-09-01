import { env } from '@main/env'
import type { Database } from '@shared/types'
import SQLite from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'

const database = new SQLite(env.DATABASE)
database.pragma('foreign_keys = ON')

export const dialect = new SqliteDialect({
  database
})

export const db = new Kysely<Database>({
  dialect,
  plugins: [new CamelCasePlugin()]
})
