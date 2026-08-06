import { useContext } from 'react'
import UserProvider, { UserContext } from '../contexts/UserContext'

export function useUser() {
  const context = useContext(UserContext)

  if (context === undefined) {
    throw new Error(`${useUser.name} must be used within a <${UserProvider.name}>`)
  }

  return context
}
