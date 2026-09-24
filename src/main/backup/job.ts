import { state } from '@main/api'
import { backupDatabase } from './service'

export function startDatabaseBackupJob(): NodeJS.Timeout {
  const run = async (): Promise<void> => {
    if (state.database.stale) {
      try {
        await backupDatabase()
        state.database.stale = false
      } catch {
        console.error('Scheduled database backup failed.')
      }
    }
  }

  // Runs every hour when the database is stale.
  return setInterval(run, 60 * 60 * 1000)
}
