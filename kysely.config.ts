import SQLite from 'better-sqlite3'
import { SqliteDialect } from 'kysely'
import { defineConfig } from 'kysely-ctl'
import { env } from './src/main/env'

export default defineConfig({
  // To-do: Re-use the dialect. This is temporary because 'kysely-ctl' cannot
  // resolve import path alias.
  dialect: new SqliteDialect({
    database: new SQLite(env.DATABASE)
  }),
  migrations: {
    migrationFolder: './migrations'
  }
})
