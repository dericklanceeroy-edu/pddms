import SQLite from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import { env } from '../lib'
import { Database } from './tables'

export const dialect = new SqliteDialect({
  database: new SQLite(env.DATABASE)
})

export const db = new Kysely<Database>({
  dialect,
  plugins: [new CamelCasePlugin()]
})
