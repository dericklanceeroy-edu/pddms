import { signIn as requestSignIn, signOut as requestSignOut } from '@renderer/services/auth'
import type { AccountWithoutPassword, Credentials } from '@shared/types'
import { Navigate, useRouterState } from '@tanstack/react-router'
import { useMemo, useState, type PropsWithChildren, type ReactElement } from 'react'
import { AccountContext } from './Context'

export default function AccountProvider({ children }: PropsWithChildren): ReactElement {
  const [account, setAccount] = useState<AccountWithoutPassword | null>(null)
  const path = useRouterState({ select: (state) => state.location.pathname })
  const isPublicRoute = path === '/signIn' || path === '/new' || path.startsWith('/new/')

  const value = useMemo(
    () => ({
      account,
      signIn: async (credentials: Credentials) => {
        const result = await requestSignIn(credentials)
        if (result.success && result.account) setAccount(result.account)
        return result
      },
      signOut: async () => {
        const result = await requestSignOut()
        if (result.success) setAccount(null)
        return result
      }
    }),
    [account]
  )

  if (!account && !isPublicRoute) return <Navigate to="/signIn" replace />
  if (account && path === '/signIn') return <Navigate to="/" replace />

  return <AccountContext value={value}>{children}</AccountContext>
}
