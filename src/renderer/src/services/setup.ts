import { channels } from '@shared/constants'
import { masterSetupSchema } from '@shared/schemas'
import type { AccountWithoutPassword } from '@shared/types'
import { formatValidationError } from '@shared/validation'

export interface MasterSetup {
  fullName: string
  username: string
  password: string
}

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

export async function createMaster(credentials: MasterSetup): Promise<CreateMasterResult> {
  const validation = masterSetupSchema.safeParse(credentials)
  if (!validation.success) return { success: false, error: formatValidationError(validation.error) }

  try {
    return (await window.electron.ipcRenderer.invoke(
      channels.setup.createMaster,
      validation.data
    )) as CreateMasterResult
  } catch {
    return { success: false, error: 'Unable to create the master account.' }
  }
}
