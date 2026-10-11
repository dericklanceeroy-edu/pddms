import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { channels } from '@shared/constants'
import { formatValidationError } from '@shared/validation'
import { getDashboard } from './repository'

ipcMain.handle(channels.dashboard.get, async () => {
  try {
    if (!state.session) return { success: false, error: 'Authentication is required.' }
    // Note: The data is scoped to the signed-in role in the repository, not in the renderer.
    return { success: true, data: await getDashboard(state.session.account) }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
