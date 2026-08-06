import type { UserWithoutPassword } from '@shared/types'
import { createContext, useContext } from 'react'

interface UserContextData {
  user: UserWithoutPassword | null
}

export const UserContext = createContext<UserContextData | undefined>(undefined)

export function useUser() {
  const context = useContext(UserContext)

  if (context === undefined) {
    throw new Error('useUser must be used within a <UserProvider>')
  }

  return context
}

export { UserProvider } from './UserProvider'
