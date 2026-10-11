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
  FiCreditCard,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiPackage,
  FiRefreshCw,
  FiShoppingBag,
  FiTruck,
  FiUser,
  FiUsers,
  FiX
} from 'react-icons/fi'

type ProcurementSection = 'receiving' | 'invoices'
interface NavigationItem {
  label: string
  to: string
  icon: IconType
  /** Opens a specific procurement tab, e.g. Receiving inside Suppliers & purchasing. */
  tab?: ProcurementSection
}

// Note: Grouped by staff task. Every item still links to the existing module and route
// permissions; groups with no permitted items are hidden.
const navigation: Array<{ group: string; items: NavigationItem[] }> = [
  {
    group: 'Daily work',
    items: [
      { label: 'Overview', to: '/', icon: FiGrid },
      { label: 'Sales & dispensing', to: '/sales', icon: FiShoppingBag },
      { label: 'Customers', to: '/customers', icon: FiUser }
    ]
  },
  {
    group: 'Stock & purchasing',
    items: [
      { label: 'Inventory & expiry', to: '/inventory', icon: FiArchive },
      { label: 'Receiving', to: '/suppliers', icon: FiPackage, tab: 'receiving' },
      { label: 'Suppliers & orders', to: '/suppliers', icon: FiTruck },
      { label: 'Invoices & payments', to: '/suppliers', icon: FiCreditCard, tab: 'invoices' }
    ]
  },
  {
    group: 'Business',
    items: [
      { label: 'Wholesale & deliveries', to: '/wholesale', icon: FiTruck },
      { label: 'Reports', to: '/reports', icon: FiBarChart2 }
    ]
  },
  {
    group: 'Account & admin',
    items: [
      { label: 'User management', to: '/users', icon: FiUsers },
      { label: 'My profile', to: '/profile', icon: FiUser }
    ]
  }
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
  const activeTab = useRouterState({
    select: (state) => (state.location.search as { tab?: string }).tab
  })
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
    <div className="glass-sidebar flex h-full flex-col text-slate-300">
      <div className="bg-sidebar-950 flex h-16 shrink-0 items-center justify-between gap-3 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-brand-600 grid size-10 shrink-0 place-items-center rounded-md text-2xl font-semibold text-white">
            +
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight text-white">Med Prix</p>
            <p className="truncate text-xs text-slate-400">Pharmacy management</p>
          </div>
        </div>
        {onClose && (
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="focus-visible:ring-brand-400 grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:outline-none"
          >
            <FiX aria-hidden="true" />
          </button>
        )}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-5" aria-label="Dashboard sections">
        {navigation.map(({ group, items }) => {
          const permitted = items.filter(
            ({ to }) => account !== null && canAccessPath(account.role, to)
          )
          if (permitted.length === 0) return null
          return (
            <div key={group} className="pb-5">
              <p className="px-5 pb-1.5 text-[0.7rem] font-semibold tracking-wider text-slate-400 uppercase">
                {group}
              </p>
              {permitted.map(({ label, to, icon: Icon, tab }) => {
                const isActive =
                  to === '/suppliers'
                    ? activePath === to &&
                      (activeTab === tab ||
                        (!tab && !['receiving', 'invoices'].includes(activeTab ?? '')))
                    : activePath === to ||
                      (to === '/inventory' && activePath.startsWith('/items/')) ||
                      (to === '/customers' && activePath.startsWith('/customers/'))

                return (
                  <Link
                    key={label}
                    to={to}
                    search={to === '/suppliers' ? { tab } : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={onClose}
                    className={`group flex items-center gap-3 border-l-4 px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-brand-300 bg-brand-600 text-white'
                        : 'border-transparent text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="bg-sidebar-950 shrink-0 border-t border-white/10 p-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 grid size-9 place-items-center rounded-full text-xs font-semibold text-white">
              {account?.username.slice(0, 2).toUpperCase() ?? '—'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {account?.username ?? 'Unknown account'}
              </p>
              <p className="text-xs text-amber-300">
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
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60"
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
    <div className="admin-dashboard relative isolate min-h-screen font-sans text-slate-900">
      {isNavigationOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
            onClick={closeNavigation}
          />
          <aside
            ref={mobileNavigationRef}
            id="dashboard-mobile-navigation"
            role="dialog"
            aria-label="Dashboard navigation"
            aria-modal="true"
            className="fixed inset-y-0 left-0 z-50 w-64 shadow-2xl lg:hidden"
          >
            <Sidebar
              activePath={activePath}
              onClose={closeNavigation}
              closeButtonRef={closeButtonRef}
            />
          </aside>
        </>
      )}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 overflow-hidden lg:block">
        <Sidebar activePath={activePath} />
      </aside>
      <div className="min-w-0 lg:pl-64">
        <header className="glass-header sticky top-0 z-30">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                ref={navigationButtonRef}
                type="button"
                aria-label="Open navigation"
                aria-controls="dashboard-mobile-navigation"
                aria-expanded={isNavigationOpen}
                onClick={() => setIsNavigationOpen(true)}
                className="icon-button shrink-0 lg:hidden"
              >
                <FiMenu aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight text-slate-900">
                  {pageTitle}
                </h1>
                <p className="hidden truncate text-xs text-slate-500 sm:block">
                  {dateFormatter.format(generatedAt)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {source && (
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {source.label}
                </span>
              )}
              {(source || isLoading) && (
                <span className="hidden text-xs text-slate-500 md:inline">
                  {source ? `Updated ${timeFormatter.format(generatedAt)}` : 'Loading data'}
                </span>
              )}
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
        <main className="mx-auto w-full max-w-[100rem] p-4 sm:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  )
}
