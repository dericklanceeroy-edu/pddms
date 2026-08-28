import type {
  DashboardSummaryMetric,
  DashboardSummaryMetricId,
  DashboardTrendDirection
} from '@renderer/data/adminDashboard'
import type { ReactElement } from 'react'
import type { IconType } from 'react-icons'
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCalendar,
  FiDollarSign,
  FiMinus,
  FiShoppingBag
} from 'react-icons/fi'

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
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
    color: '#2563eb',
    iconClassName: 'bg-blue-50 text-blue-600 ring-blue-100',
    positiveDirection: 'up'
  },
  'items-sold': {
    icon: FiShoppingBag,
    color: '#7c3aed',
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
  }
}

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
    <article className="group min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`grid size-10 place-items-center rounded-xl ring-1 ${config.iconClassName}`}
        >
          <config.icon className="size-4.5" aria-hidden="true" />
        </div>
        <Sparkline values={metric.sparkline} color={config.color} />
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-slate-500">{metric.label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.7rem]">
          {formatMetric(metric)}
        </p>
      </div>
      <div className="mt-3 flex min-w-0 items-center gap-2 text-xs">
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-semibold ${trendClassName}`}
        >
          <TrendIcon className="size-3" aria-hidden="true" />
          {metric.trend.direction === 'flat' ? 'Stable' : `${metric.trend.percentage}%`}
        </span>
        <span className="truncate text-slate-500">{metric.trend.label}</span>
      </div>
    </article>
  )
}
