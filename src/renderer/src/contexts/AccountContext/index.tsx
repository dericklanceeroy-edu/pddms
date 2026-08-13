import type { AccountWithoutPassword } from '@shared/types'
import { createContext } from 'react'
import AccountProvider from './AccountProvider'

export interface AccountContextData {
  account: AccountWithoutPassword | null
}

export const AccountContext = createContext<AccountContextData | undefined>(undefined)

export default AccountProvider
