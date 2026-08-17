import { globalContext } from '@libs/api'
import { backupDatabase } from './service'

export function startDatabaseBackupJob() {
  const run = async () => {
    if (globalContext.database.stale) {
      await backupDatabase()
      globalContext.database.stale = false
    }
  }

  // Runs every hour when the database is stale.
  return setInterval(run, 60 * 60 * 1000)
}
