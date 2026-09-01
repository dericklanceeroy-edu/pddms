import SQLite from 'better-sqlite3'
import { CamelCasePlugin, SqliteDialect } from 'kysely'
import { defineConfig } from 'kysely-ctl'
import { env } from './src/main/env'

export default defineConfig({
  // To-do: Re-use the dialect. This is temporary because 'kysely-ctl' cannot
  // resolve import path alias.
  dialect: new SqliteDialect({
    database: (() => {
      const database = new SQLite(env.DATABASE)
      database.pragma('foreign_keys = ON')
      return database
    })()
  }),
  plugins: [new CamelCasePlugin()],
  migrations: {
    migrationFolder: './migrations'
  }
})
