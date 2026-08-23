import { env } from '@libs/env'
import type { Database } from '@shared/types'
import SQLite from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'

export const dialect = new SqliteDialect({
  database: new SQLite(env.DATABASE)
})

export const db = new Kysely<Database>({
  dialect,
  plugins: [new CamelCasePlugin()]
})
