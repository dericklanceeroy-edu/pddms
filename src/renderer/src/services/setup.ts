import { channels } from '@shared/constants'
import type { AccountWithoutPassword, Credentials } from '@shared/types'

export interface SetupStatusResult {
  success: boolean
  requiresSetup?: boolean
  error?: string
}

export interface CreateMasterResult {
  success: boolean
  account?: AccountWithoutPassword
  error?: string
}

export async function getSetupStatus(): Promise<SetupStatusResult> {
  try {
    return (await window.electron.ipcRenderer.invoke(channels.setup.getStatus)) as SetupStatusResult
  } catch {
    return { success: false, error: 'Unable to check the installation status.' }
  }
}

export async function createMaster(credentials: Credentials): Promise<CreateMasterResult> {
  try {
    return (await window.electron.ipcRenderer.invoke(
      channels.setup.createMaster,
      credentials
    )) as CreateMasterResult
  } catch {
    return { success: false, error: 'Unable to create the master account.' }
  }
}
