import type { AccountWithoutPassword } from '@shared/types'
import { createContext } from 'react'
import AccountProvider from './AccountProvider'

interface AccountContext {
  account: AccountWithoutPassword | null
}

export const AccountContext = createContext<AccountContext | null>(null)

export default AccountProvider
