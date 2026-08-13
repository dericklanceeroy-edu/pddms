import type { PropsWithChildren } from 'react'
import { AccountContext } from '.'

export default function AccountProvider({ children }: PropsWithChildren) {
  return <AccountContext value={{ account: null }}>{children}</AccountContext>
}
