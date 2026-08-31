import { channels } from '@shared/constants'
import type { Account, AccountWithoutPassword, Credentials } from '@shared/types'

export interface AuthActionResult {
  success: boolean
  account?: AccountWithoutPassword
  error?: string
}

interface SignInResponse {
  success: boolean
  account?: Account
  error?: string
}

interface SignOutResponse {
  success: boolean
  error?: string
}

const getPublicAccount = (account: Account): AccountWithoutPassword => ({
  id: account.id,
  role: account.role,
  username: account.username,
  isArchived: account.isArchived,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt
})

export async function signIn(credentials: Credentials): Promise<AuthActionResult> {
  try {
    const response = (await window.electron.ipcRenderer.invoke(
      channels.auth.signIn,
      credentials
    )) as SignInResponse

    if (!response.success || !response.account) {
      return { success: false, error: response.error }
    }

    return { success: true, account: getPublicAccount(response.account) }
  } catch {
    return {
      success: false,
      error: 'Unable to reach the authentication service. Please try again.'
    }
  }
}

export async function signOut(): Promise<AuthActionResult> {
  try {
    const response = (await window.electron.ipcRenderer.invoke(
      channels.auth.signOut
    )) as SignOutResponse

    return response.success
      ? { success: true }
      : { success: false, error: response.error ?? 'Unable to sign out.' }
  } catch {
    return {
      success: false,
      error: 'Unable to reach the authentication service. Please try again.'
    }
  }
}
