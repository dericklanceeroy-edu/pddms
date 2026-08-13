import { useContext } from 'react'
import AccountProvider, { AccountContext } from '../contexts/AccountContext'

export function useAccount() {
  const context = useContext(AccountContext)

  if (context === undefined) {
    throw new Error(`${useAccount.name} must be used within a <${AccountProvider.name}>`)
  }

  return context
}
