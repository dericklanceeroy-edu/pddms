import { globalContext } from '@libs/api'
import { backupDatabase } from './service'

export function startDatabaseBackupJob() {
  const run = async () => {
    if (globalContext.database.modified) {
      await backupDatabase()
      globalContext.database.modified = false
    }
  }

  // Runs every hour when the database is modified.
  return setInterval(run, 60 * 60 * 1000)
}
