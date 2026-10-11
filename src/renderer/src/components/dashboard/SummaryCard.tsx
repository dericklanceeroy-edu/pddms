import type {
  DashboardSummaryMetric,
  DashboardSummaryMetricId,
  DashboardTrendDirection
} from '@renderer/data/adminDashboard'
import { useAccount } from '@renderer/hooks/useAccount'
import { canAccessPath } from '@renderer/navigation/access'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import type { IconType } from 'react-icons'
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCalendar,
  FiChevronsRight,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiMinus,
  FiPackage,
  FiShoppingBag
} from 'react-icons/fi'

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2
})

const numberFormatter = new Intl.NumberFormat('en-PH')

const presentation: Record<
  DashboardSummaryMetricId,
  {
    icon: IconType
    color: string
    iconClassName: string
    positiveDirection: DashboardTrendDirection | null
  }
> = {
  'daily-sales': {
    icon: FiDollarSign,
    color: '#7d3d6f',
    iconClassName: 'bg-brand-50 text-brand-600 ring-brand-100',
    positiveDirection: 'up'
  },
  'items-sold': {
    icon: FiShoppingBag,
    color: '#6d5ab8',
    iconClassName: 'bg-violet-50 text-violet-600 ring-violet-100',
    positiveDirection: 'up'
  },
  'low-stock-items': {
    icon: FiAlertTriangle,
    color: '#e11d48',
    iconClassName: 'bg-rose-50 text-rose-600 ring-rose-100',
    positiveDirection: 'down'
  },
  'expiring-batches': {
    icon: FiCalendar,
    color: '#d97706',
    iconClassName: 'bg-amber-50 text-amber-600 ring-amber-100',
    positiveDirection: null
  },
  'my-transactions': {
    icon: FiFileText,
    color: '#0d9488',
    iconClassName: 'bg-brand-50 text-brand-600 ring-brand-100',
    positiveDirection: 'up'
  },
  'awaiting-delivery': {
    icon: FiPackage,
    color: '#0891b2',
    iconClassName: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    positiveDirection: null
  },
  'supplier-payments-due': {
    icon: FiCreditCard,
    color: '#d97706',
    iconClassName: 'bg-amber-50 text-amber-600 ring-amber-100',
    positiveDirection: 'down'
  }
}

interface MetricDestination {
  to: '/reports' | '/inventory' | '/sales' | '/suppliers'
  tab?: 'receiving' | 'invoices'
  label: string
}

/** Where each metric's underlying records can be reviewed. */
const destinations: Record<DashboardSummaryMetricId, MetricDestination> = {
  'daily-sales': { to: '/reports', label: 'View sales report' },
  'items-sold': { to: '/reports', label: 'View sales report' },
  'low-stock-items': { to: '/inventory', label: 'Review stock levels' },
  'expiring-batches': { to: '/inventory', label: 'Review expiring batches' },
  'my-transactions': { to: '/sales', label: 'Open sales & history' },
  'awaiting-delivery': { to: '/suppliers', tab: 'receiving', label: 'Receive products' },
  'supplier-payments-due': { to: '/suppliers', tab: 'invoices', label: 'Review invoices' }
}

/** Cashiers cannot open Reports, so their own sales figures link to the sales screen instead. */
const salesHistory: MetricDestination = { to: '/sales', label: 'Open sales & history' }

function formatMetric(metric: DashboardSummaryMetric): string {
  return metric.format === 'currency'
    ? currencyFormatter.format(metric.value)
    : numberFormatter.format(metric.value)
}

function Sparkline({ values, color }: { values: number[]; color: string }): ReactElement {
  const width = 116
  const height = 48
  const padding = 3
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = maximum - minimum || 1
  const coordinates = values.map((value, index) => ({
    x: padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((value - minimum) / range) * (height - padding * 2)
  }))
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')
  const first = coordinates[0]
  const last = coordinates.at(-1)
  const areaPath =
    first && last
      ? `M ${first.x} ${height} L ${points.replaceAll(',', ' ')} L ${last.x} ${height} Z`
      : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-28" aria-hidden="true">
      <path d={areaPath} fill={color} opacity="0.08" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function SummaryCard({ metric }: { metric: DashboardSummaryMetric }): ReactElement {
  const config = presentation[metric.id]
  const { account } = useAccount()
  const destination =
    account?.role === 'cashier' && (metric.id === 'daily-sales' || metric.id === 'items-sold')
      ? salesHistory
      : destinations[metric.id]
  const canOpen = account !== null && canAccessPath(account.role, destination.to)
  const TrendIcon =
    metric.trend.direction === 'up'
      ? FiArrowUp
      : metric.trend.direction === 'down'
        ? FiArrowDown
        : FiMinus
  const isPositive = config.positiveDirection === metric.trend.direction
  const trendClassName =
    metric.trend.direction === 'flat'
      ? 'bg-slate-100 text-slate-600'
      : isPositive
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-rose-50 text-rose-700'

  return (
    <article className="metric-card group relative flex min-w-0 flex-col overflow-hidden p-0">
      <div className="flex-1 p-5">
        <div className="relative flex items-start justify-between gap-3">
          <div
            className={`grid size-10 shrink-0 place-items-center rounded-lg ring-1 ${config.iconClassName}`}
          >
            <config.icon className="size-4.5" aria-hidden="true" />
          </div>
          {metric.sparkline.length > 1 && (
            <div className="-mt-1 -mr-1 opacity-85">
              <Sparkline values={metric.sparkline} color={config.color} />
            </div>
          )}
        </div>
        <div className="relative mt-5">
          <p className="text-sm font-medium text-slate-500">{metric.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight break-words text-slate-900 tabular-nums">
            {formatMetric(metric)}
          </p>
        </div>
        <div className="relative mt-4 flex min-w-0 flex-wrap items-center gap-2 text-xs">
          {metric.sparkline.length > 1 && (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-semibold ${trendClassName}`}
            >
              <TrendIcon className="size-3" aria-hidden="true" />
              {metric.trend.direction === 'flat' ? 'Stable' : `${metric.trend.percentage}%`}
            </span>
          )}
          <span className="text-slate-500">{metric.trend.label}</span>
        </div>
      </div>
      {canOpen && (
        <Link
          to={destination.to}
          search={destination.to === '/suppliers' ? { tab: destination.tab } : undefined}
          className="hover:bg-brand-50 hover:text-brand-800 flex items-center justify-center gap-1.5 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 transition-colors"
        >
          {destination.label} <FiChevronsRight aria-hidden="true" />
        </Link>
      )}
    </article>
  )
}
