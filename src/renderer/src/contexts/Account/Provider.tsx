import {
  getAuthStatus,
  signIn as requestSignIn,
  signOut as requestSignOut
} from '@renderer/services/auth'
import type { AccountWithoutPassword, Credentials } from '@shared/types'
import { Navigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type PropsWithChildren, type ReactElement } from 'react'
import { AccountContext } from './Context'

export default function AccountProvider({ children }: PropsWithChildren): ReactElement {
  const [account, setAccount] = useState<AccountWithoutPassword | null>(null)
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null)
  const [statusError, setStatusError] = useState('')
  const path = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    void getAuthStatus().then((result) => {
      if (!result.success || result.hasAccounts === undefined) {
        setStatusError(result.error ?? 'Unable to initialize authentication.')
        return
      }

      setHasAccounts(result.hasAccounts)
      setAccount(result.account ?? null)
    })
  }, [])

  const value = useMemo(
    () => ({
      account,
      completeSetup: () => setHasAccounts(true),
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

  if (statusError) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Unable to start authentication</h1>
          <p role="alert" className="mt-2 text-sm text-rose-700">
            {statusError}
          </p>
        </div>
      </main>
    )
  }

  if (hasAccounts === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-50 text-sm text-neutral-500">
        Starting Med Prix…
      </main>
    )
  }

  const isSetupRoute = path === '/new' || path.startsWith('/new/')

  if (!hasAccounts && !isSetupRoute) return <Navigate to="/new" replace />
  if (hasAccounts && !account && isSetupRoute && path !== '/new/completion')
    return <Navigate to="/signIn" replace />
  if (hasAccounts && !account && path !== '/signIn' && path !== '/new/completion')
    return <Navigate to="/signIn" replace />
  if (account && (path === '/signIn' || isSetupRoute)) return <Navigate to="/" replace />

  return <AccountContext value={value}>{children}</AccountContext>
}
