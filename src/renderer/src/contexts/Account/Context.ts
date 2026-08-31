import type { AuthActionResult } from '@renderer/services/auth'
import type { AccountWithoutPassword, Credentials } from '@shared/types'
import { createContext } from 'react'

export interface AccountContext {
  account: AccountWithoutPassword | null
  completeSetup: VoidFunction
  signIn: (credentials: Credentials) => Promise<AuthActionResult>
  signOut: () => Promise<AuthActionResult>
}

export const AccountContext = createContext<AccountContext | null>(null)
