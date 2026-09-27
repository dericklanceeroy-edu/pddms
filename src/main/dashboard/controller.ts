import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { channels } from '@shared/constants'
import { formatValidationError } from '@shared/validation'
import { getAdminDashboard } from './repository'

ipcMain.handle(channels.dashboard.getAdmin, async () => {
  try {
    if (!state.session) return { success: false, error: 'Authentication is required.' }
    if (state.session.account.role === 'cashier') {
      return { success: false, error: 'Dashboard access is restricted to staff and master users.' }
    }
    return { success: true, data: await getAdminDashboard() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
