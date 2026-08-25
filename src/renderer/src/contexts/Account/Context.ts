import type { AccountWithoutPassword } from '@shared/types'
import { createContext } from 'react'

export interface AccountContext {
  account: AccountWithoutPassword | null
}

export const AccountContext = createContext<AccountContext | null>(null)
