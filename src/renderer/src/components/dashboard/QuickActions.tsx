import type { DashboardView } from '@renderer/data/adminDashboard'
import { useAccount } from '@renderer/hooks/useAccount'
import { canAccessPath } from '@renderer/navigation/access'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import type { IconType } from 'react-icons'
import {
  FiBarChart2,
  FiClipboard,
  FiCreditCard,
  FiPackage,
  FiSearch,
  FiShoppingCart,
  FiUserPlus,
  FiUsers
} from 'react-icons/fi'

interface QuickAction {
  label: string
  description: string
  to: '/sales' | '/inventory' | '/suppliers' | '/customers' | '/users' | '/reports'
  tab?: 'orders' | 'receiving' | 'invoices'
  icon: IconType
}

// Note: Ordered by how often each role needs the task. Links are still filtered by canAccessPath,
// so a role never sees a shortcut to a page it cannot open.
const actions: Record<DashboardView, QuickAction[]> = {
  admin: [
    {
      label: 'Manage Users',
      description: 'Create, block or unblock',
      to: '/users',
      icon: FiUsers
    },
    {
      label: 'Open Reports',
      description: 'Sales, stock and receiving',
      to: '/reports',
      icon: FiBarChart2
    },
    {
      label: 'Create Purchase Order',
      description: 'Order stock from a supplier',
      to: '/suppliers',
      tab: 'orders',
      icon: FiClipboard
    },
    {
      label: 'Receive Products',
      description: 'Record batches and expiry dates',
      to: '/suppliers',
      tab: 'receiving',
      icon: FiPackage
    }
  ],
  staff: [
    {
      label: 'Look Up a Product',
      description: 'Stock, batches and expiry dates',
      to: '/inventory',
      icon: FiSearch
    },
    {
      label: 'Receive Products',
      description: 'Record batches and expiry dates',
      to: '/suppliers',
      tab: 'receiving',
      icon: FiPackage
    },
    {
      label: 'Create Purchase Order',
      description: 'Order stock from a supplier',
      to: '/suppliers',
      tab: 'orders',
      icon: FiClipboard
    },
    {
      label: 'Record Supplier Payment',
      description: 'Invoices, balances and payments',
      to: '/suppliers',
      tab: 'invoices',
      icon: FiCreditCard
    }
  ],
  cashier: [
    {
      label: 'Start a Sale',
      description: 'Search products, check stock, take payment',
      to: '/sales',
      icon: FiShoppingCart
    },
    {
      label: 'Find or Add a Customer',
      description: 'Senior Citizen and PWD records',
      to: '/customers',
      icon: FiUserPlus
    }
  ]
}

export default function QuickActions({ view }: { view: DashboardView }): ReactElement | null {
  const { account } = useAccount()
  const permitted = actions[view].filter(
    (action) => account !== null && canAccessPath(account.role, action.to)
  )
  if (permitted.length === 0) return null

  return (
    <nav aria-label="Shortcuts" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {permitted.map(({ label, description, to, tab, icon: Icon }, index) => (
        <Link
          key={label}
          to={to}
          search={to === '/suppliers' ? { tab } : undefined}
          className={`flex min-w-0 items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
            index === 0
              ? 'bg-brand-600 border-brand-600 hover:bg-brand-700 text-white'
              : 'hover:border-brand-300 hover:bg-brand-50 border-slate-200 bg-white text-slate-800'
          }`}
        >
          <Icon
            className={`size-5 shrink-0 ${index === 0 ? 'text-white' : 'text-brand-600'}`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{label}</span>
            <span
              className={`block text-xs leading-5 ${index === 0 ? 'text-brand-50' : 'text-slate-500'}`}
            >
              {description}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  )
}
