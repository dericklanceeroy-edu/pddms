import { channels } from '@shared/constants'
import type { NewAccount } from '@shared/types'

export interface CreateAccountResult {
  success: boolean
  error?: string
}

export async function createAccount(account: NewAccount): Promise<CreateAccountResult> {
  try {
    const response = (await window.electron.ipcRenderer.invoke(
      channels.account.createOne,
      account
    )) as CreateAccountResult

    return response.success
      ? { success: true }
      : { success: false, error: response.error ?? 'Unable to create the account.' }
  } catch {
    return { success: false, error: 'Unable to reach the account service.' }
  }
}
