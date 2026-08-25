import type { AccountWithoutPassword } from '@shared/types'
import { createContext, useContext } from 'react'
import AccountProvider from './Provider'

export interface AccountContext {
  account: AccountWithoutPassword | null
}

export const AccountContext = createContext<AccountContext | null>(null)

export function useAccount() {
  const context = useContext(AccountContext)

  if (context === null) {
    throw new Error(`${useAccount.name} must be used within a <${AccountProvider.name}>`)
  }

  return context
}
