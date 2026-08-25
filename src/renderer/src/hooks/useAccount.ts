import { AccountContext } from '@renderer/contexts/Account/Context'
import AccountProvider from '@renderer/contexts/Account/Provider'
import { useContext } from 'react'

export function useAccount() {
  const context = useContext(AccountContext)

  if (context === null) {
    throw new Error(`${useAccount.name} must be used within a <${AccountProvider.name}>`)
  }

  return context
}
