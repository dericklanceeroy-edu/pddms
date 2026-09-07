import { mapAccount, type ManagedUser, type UserFormValues } from '@renderer/data/userManagement'
import { channels } from '@shared/constants'
import { accountUpdateSchema, newAccountSchema } from '@shared/schemas'
import type { AccountWithoutPassword } from '@shared/types'
import { validate } from '@shared/validation'

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
  const payload = validate(newAccountSchema, values)
  const result = (await window.electron.ipcRenderer.invoke(
    channels.account.createOne,
    payload
  )) as AccountResult
  if (!result.success || !result.account) {
    throw new Error(result.error ?? 'Unable to create the user account.')
  }
  return mapAccount(result.account)
}

export async function updateAccount(id: number, values: Partial<UserFormValues>): Promise<void> {
  const payload = validate(accountUpdateSchema, values)
  const result = (await window.electron.ipcRenderer.invoke(
    channels.account.updateOneById,
    id,
    payload
  )) as AccountResult
  if (!result.success) throw new Error(result.error ?? 'Unable to update the user account.')
}

export async function setAccountBlocked(id: number, blocked: boolean): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.account.setBlockedById,
    id,
    blocked
  )) as AccountResult
  if (!result.success) throw new Error(result.error ?? 'Unable to change account access.')
}

export async function deleteAccount(id: number): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.account.removeOneById,
    id
  )) as AccountResult
  if (!result.success) throw new Error(result.error ?? 'Unable to delete the account.')
}
