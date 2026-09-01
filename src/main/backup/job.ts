import { state } from '@main/api'
import { backupDatabase } from './service'

export function startDatabaseBackupJob(): NodeJS.Timeout {
  const run = async (): Promise<void> => {
    if (state.database.stale) {
      await backupDatabase()
      state.database.stale = false
    }
  }

  // Runs every hour when the database is stale.
  return setInterval(run, 60 * 60 * 1000)
}
