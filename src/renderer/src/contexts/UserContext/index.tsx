import type { UserWithoutPassword } from '@shared/types'
import { createContext } from 'react'
import UserProvider from './UserProvider'

export interface UserContextData {
  user: UserWithoutPassword | null
}

export const UserContext = createContext<UserContextData | undefined>(undefined)

export default UserProvider
