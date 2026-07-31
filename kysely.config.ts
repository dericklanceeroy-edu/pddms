import { defineConfig } from 'kysely-ctl'
import { dialect } from './src/main/db'

export default defineConfig({
  dialect,
  migrations: {
    migrationFolder: './migrations'
  },
})
