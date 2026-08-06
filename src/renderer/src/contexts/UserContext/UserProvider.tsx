import type { PropsWithChildren } from 'react'
import { UserContext } from '.'

export default function UserProvider({ children }: PropsWithChildren) {
  return <UserContext value={{ user: null }}>{children}</UserContext>
}
