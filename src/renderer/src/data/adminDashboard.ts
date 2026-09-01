import { channels } from '@shared/constants'
import type { AdminDashboardData } from '@shared/dashboard'

export type * from '@shared/dashboard'

interface DashboardResponse {
  success: boolean
  data?: AdminDashboardData
  error?: string
}

export async function fetchAdminDashboardData(signal?: AbortSignal): Promise<AdminDashboardData> {
  if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')

  const response = (await window.electron.ipcRenderer.invoke(
    channels.dashboard.getAdmin
  )) as DashboardResponse

  if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
  if (!response.success || !response.data) {
    throw new Error(response.error ?? 'The dashboard could not be loaded.')
  }

  return response.data
}
