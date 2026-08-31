import { channels } from '@shared/constants'
import type { AccountWithoutPassword, Credentials } from '@shared/types'

export interface AuthActionResult {
  success: boolean
  account?: AccountWithoutPassword
  error?: string
}

interface SignInResponse {
  success: boolean
  account?: AccountWithoutPassword
  error?: string
}

interface AuthStatusResponse {
  success: boolean
  hasAccounts?: boolean
  account?: AccountWithoutPassword | null
  error?: string
}

interface SignOutResponse {
  success: boolean
  error?: string
}

export interface AuthStatusResult extends AuthActionResult {
  hasAccounts?: boolean
}

export async function getAuthStatus(): Promise<AuthStatusResult> {
  try {
    const response = (await window.electron.ipcRenderer.invoke(
      channels.auth.getStatus
    )) as AuthStatusResponse

    return response.success
      ? { success: true, hasAccounts: response.hasAccounts, account: response.account ?? undefined }
      : { success: false, error: response.error }
  } catch {
    return { success: false, error: 'Unable to check the authentication service.' }
  }
}

export async function signIn(credentials: Credentials): Promise<AuthActionResult> {
  try {
    const response = (await window.electron.ipcRenderer.invoke(
      channels.auth.signIn,
      credentials
    )) as SignInResponse

    if (!response.success || !response.account) {
      return { success: false, error: response.error }
    }

    return { success: true, account: response.account }
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
