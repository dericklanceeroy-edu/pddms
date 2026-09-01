import { mapAccount, type ManagedUser, type UserFormValues } from '@renderer/data/userManagement'
import { channels } from '@shared/constants'
import type { AccountWithoutPassword } from '@shared/types'

interface AccountResult {
  success: boolean
  account?: AccountWithoutPassword
  accounts?: AccountWithoutPassword[]
  error?: string
}

export async function getAccounts(): Promise<ManagedUser[]> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.account.getAll
  )) as AccountResult
  if (!result.success) throw new Error(result.error ?? 'Unable to load user accounts.')
  return (result.accounts ?? []).map(mapAccount)
}

export async function createAccount(values: UserFormValues): Promise<ManagedUser> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.account.createOne,
    values
  )) as AccountResult
  if (!result.success || !result.account) {
    throw new Error(result.error ?? 'Unable to create the user account.')
  }
  return mapAccount(result.account)
}

export async function setAccountBlocked(id: number, blocked: boolean): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.account.setBlockedById,
    id,
    blocked
  )) as AccountResult
  if (!result.success) throw new Error(result.error ?? 'Unable to change account access.')
}
