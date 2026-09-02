import type { DashboardSourceMetadata } from '@renderer/data/adminDashboard'
import { useAccount } from '@renderer/hooks/useAccount'
import { canAccessPath } from '@renderer/navigation/access'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
  type RefObject
} from 'react'
import type { IconType } from 'react-icons'
import {
  FiArchive,
  FiBarChart2,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiRefreshCw,
  FiShoppingBag,
  FiTruck,
  FiUser,
  FiUsers,
  FiX
} from 'react-icons/fi'

const navigation: Array<{ label: string; to: string; icon: IconType }> = [
  { label: 'Overview', to: '/', icon: FiGrid },
  { label: 'Sales & dispensing', to: '/sales', icon: FiShoppingBag },
  { label: 'Customers', to: '/customers', icon: FiUser },
  { label: 'Inventory', to: '/inventory', icon: FiArchive },
  { label: 'Suppliers & orders', to: '/suppliers', icon: FiTruck },
  { label: 'Reports', to: '/reports', icon: FiBarChart2 },
  { label: 'User management', to: '/users', icon: FiUsers }
]

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric'
})

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit'
})

interface DashboardShellProps extends PropsWithChildren {
  pageTitle?: string
  source?: DashboardSourceMetadata | null
  isLoading?: boolean
  isRefreshing?: boolean
  onRefresh?: VoidFunction
}

function Sidebar({
  activePath,
  onClose,
  closeButtonRef
}: {
  activePath: string
  onClose?: VoidFunction
  closeButtonRef?: RefObject<HTMLButtonElement | null>
}): ReactElement {
  const { account, signOut } = useAccount()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  const logout = async (): Promise<void> => {
    setIsSigningOut(true)
    setSignOutError('')

    const result = await signOut()
    if (!result.success) {
      setSignOutError(result.error ?? 'Unable to sign out.')
      setIsSigningOut(false)
    }
  }

  return (
    <div className="glass-sidebar flex h-full flex-col text-neutral-300">
      <div className="flex h-20 items-center justify-between gap-3 border-b border-white/10 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-mauve-500 to-indigo-600 text-2xl font-semibold text-white shadow-lg shadow-mauve-950/50">
            +
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight text-white">Med Prix</p>
            <p className="truncate text-xs text-neutral-400">Pharmacy management</p>
          </div>
        </div>
        {onClose && (
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-mauve-400 focus-visible:outline-none"
          >
            <FiX aria-hidden="true" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Dashboard sections">
        <p className="px-3 pb-2 text-[0.65rem] font-semibold tracking-[0.18em] text-neutral-500 uppercase">
          Workspace
        </p>
        {navigation
          .filter(({ to }) => account !== null && canAccessPath(account.role, to))
          .map(({ label, to, icon: Icon }) => {
            const isActive =
              activePath === to ||
              (to === '/inventory' && activePath.startsWith('/items/')) ||
              (to === '/customers' && activePath.startsWith('/customers/'))

            return (
              <Link
                key={to}
                to={to}
                aria-current={isActive ? 'page' : undefined}
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-mauve-600/95 to-indigo-600/80 text-white shadow-lg ring-1 shadow-mauve-950/35 ring-white/10'
                    : 'text-neutral-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            )
          })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-inner shadow-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-neutral-800 text-xs font-semibold text-white">
              {account?.username.slice(0, 2).toUpperCase() ?? '—'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {account?.username ?? 'Unknown account'}
              </p>
              <p className="text-xs text-neutral-400">
                {account?.role === 'master'
                  ? 'Master account'
                  : `${account?.role ?? 'User'} account`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={isSigningOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            <FiLogOut /> {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
          {signOutError && (
            <p role="alert" className="mt-2 text-xs leading-5 text-rose-300">
              {signOutError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardShell({
  children,
  pageTitle = 'Admin dashboard',
  source = null,
  isLoading = false,
  isRefreshing = false,
  onRefresh
}: DashboardShellProps): ReactElement {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const navigationButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const mobileNavigationRef = useRef<HTMLElement>(null)
  const activePath = useRouterState({ select: (state) => state.location.pathname })
  const generatedAt = source ? new Date(source.generatedAt) : new Date()

  const closeNavigation = (): void => setIsNavigationOpen(false)

  useEffect(() => {
    if (!isNavigationOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const navigationButton = navigationButtonRef.current
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleDrawerKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsNavigationOpen(false)
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = mobileNavigationRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      )
      const firstElement = focusableElements?.[0]
      const lastElement = focusableElements?.[focusableElements.length - 1]

      if (!firstElement || !lastElement) {
        return
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleDrawerKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleDrawerKeyDown)
      navigationButton?.focus()
    }
  }, [isNavigationOpen])

  return (
    <div className="admin-dashboard relative isolate min-h-screen overflow-hidden font-sans text-neutral-950">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="mesh-glow -top-52 left-[18%] size-[28rem] bg-mauve-300/20" />
        <div className="mesh-glow top-[35%] -right-48 size-[30rem] bg-indigo-300/15" />
        <div className="mesh-glow -bottom-56 left-[38%] size-[24rem] bg-violet-300/10" />
      </div>
      {isNavigationOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-neutral-950/50 backdrop-blur-[2px] xl:hidden"
            onClick={closeNavigation}
          />
          <aside
            ref={mobileNavigationRef}
            id="dashboard-mobile-navigation"
            role="dialog"
            aria-label="Dashboard navigation"
            aria-modal="true"
            className="fixed inset-y-0 left-0 z-50 w-64 shadow-2xl xl:hidden"
          >
            <Sidebar
              activePath={activePath}
              onClose={closeNavigation}
              closeButtonRef={closeButtonRef}
            />
          </aside>
        </>
      )}
      <aside className="shadow-ink-950/30 fixed inset-y-3 left-3 z-50 hidden w-64 overflow-hidden rounded-[1.75rem] shadow-2xl xl:block">
        <Sidebar activePath={activePath} />
      </aside>
      <div className="min-w-0 xl:pl-[18rem]">
        <header className="glass-header sticky top-3 z-30 mx-3 rounded-[1.5rem]">
          <div className="flex h-20 items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                ref={navigationButtonRef}
                type="button"
                aria-label="Open navigation"
                aria-controls="dashboard-mobile-navigation"
                aria-expanded={isNavigationOpen}
                onClick={() => setIsNavigationOpen(true)}
                className="icon-button shrink-0 xl:hidden"
              >
                <FiMenu aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  {pageTitle}
                </h1>
                <p className="hidden truncate text-xs text-neutral-500 sm:block">
                  {dateFormatter.format(generatedAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {source && (
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {source.label}
                </span>
              )}
              <span className="hidden text-xs text-neutral-500 md:inline">
                {source
                  ? `Updated ${timeFormatter.format(generatedAt)}`
                  : isLoading
                    ? 'Loading data'
                    : 'No data source'}
              </span>
              {onRefresh && (
                <button
                  type="button"
                  aria-label="Refresh dashboard data"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="secondary-button disabled:cursor-wait disabled:opacity-60"
                >
                  <FiRefreshCw
                    className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">Refresh data</span>
                </button>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[108rem] p-4 pt-7 sm:p-6 sm:pt-8 xl:p-8 xl:pt-10">
          {children}
        </main>
      </div>
    </div>
  )
}
