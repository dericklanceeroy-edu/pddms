import { defineConfig } from 'kysely-ctl'
import { dialect } from './src/main/lib/db'

export default defineConfig({
  dialect,
  migrations: {
    migrationFolder: './migrations'
  },
})
