import { canAccessPath, getHomePath } from '@renderer/navigation/access'
import {
  getAuthStatus,
  signIn as requestSignIn,
  signOut as requestSignOut
} from '@renderer/services/auth'
import { getSetupStatus } from '@renderer/services/setup'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import type { AccountWithoutPassword, Credentials } from '@shared/types'
import { Navigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type PropsWithChildren, type ReactElement } from 'react'
import { AccountContext } from './Context'

export default function AccountProvider({ children }: PropsWithChildren): ReactElement {
  const [account, setAccount] = useState<AccountWithoutPassword | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [requiresSetup, setRequiresSetup] = useState(false)
  const [statusError, setStatusError] = useState('')
  const path = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    void Promise.all([getAuthStatus(), getSetupStatus()]).then(([auth, setup]) => {
      if (!auth.success || !setup.success || setup.requiresSetup === undefined) {
        setStatusError(auth.error ?? setup.error ?? 'Unable to initialize the application.')
        setIsInitializing(false)
        return
      }

      setAccount(auth.account ?? null)
      setRequiresSetup(setup.requiresSetup)
      setIsInitializing(false)
    })
  }, [])

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
        if (result.success) {
          useProfileStore.getState().reset()
          setAccount(null)
        }
        return result
      },
      completeSetup: (createdAccount: AccountWithoutPassword) => {
        setAccount(createdAccount)
        setRequiresSetup(false)
      }
    }),
    [account]
  )

  if (statusError) {
    return (
      <main className="setup-stage p-6 text-center">
        <div className="setup-frame max-w-lg">
          <h1 className="text-xl font-semibold">Unable to start authentication</h1>
          <p role="alert" className="mt-2 text-sm text-rose-700">
            {statusError}
          </p>
        </div>
      </main>
    )
  }

  if (isInitializing) {
    return <main className="setup-stage text-sm text-neutral-500">Starting Med Prix…</main>
  }

  const isSetupRoute = path === '/new' || path.startsWith('/new/')

  if (requiresSetup && !isSetupRoute) return <Navigate to="/new" replace />
  if (!requiresSetup && account && path === '/new/completion') {
    return <AccountContext value={value}>{children}</AccountContext>
  }
  if (!requiresSetup && isSetupRoute) return <Navigate to={account ? '/' : '/signIn'} replace />
  if (requiresSetup) return <AccountContext value={value}>{children}</AccountContext>
  if (!account && path !== '/signIn') return <Navigate to="/signIn" replace />
  if (account && path === '/signIn') return <Navigate to={getHomePath(account.role)} replace />
  if (account && !canAccessPath(account.role, path)) {
    return <Navigate to={getHomePath(account.role)} replace />
  }

  return <AccountContext value={value}>{children}</AccountContext>
}
