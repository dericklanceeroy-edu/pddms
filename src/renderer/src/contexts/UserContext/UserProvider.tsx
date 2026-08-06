import type { PropsWithChildren } from 'react'
import { UserContext } from '.'

export function UserProvider({ children }: PropsWithChildren) {
  return <UserContext value={{ user: null }}>{children}</UserContext>
}
