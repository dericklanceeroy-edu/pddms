import type { AccountWithoutPassword } from '@shared/types'
import { createContext, useContext } from 'react'
import Provider from './Provider'

interface AccountContext {
  account: AccountWithoutPassword | null
}

export const AccountContext = createContext<AccountContext | null>(null)

export function useAccount() {
  const context = useContext(AccountContext)

  if (context === undefined) {
    throw new Error(`${useAccount.name} must be used within a <${Provider.name}>`)
  }

  return context
}

export default Provider
