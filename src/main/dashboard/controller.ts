import { state } from '@main/api'
import { channels } from '@shared/constants'
import { ipcMain } from 'electron'
import { getAdminDashboard } from './repository'

ipcMain.handle(channels.dashboard.getAdmin, async () => {
  try {
    if (!state.session) return { success: false, error: 'Authentication is required.' }
    return { success: true, data: await getAdminDashboard() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
