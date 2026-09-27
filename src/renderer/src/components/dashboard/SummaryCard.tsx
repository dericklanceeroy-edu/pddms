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
    iconClassName: 'bg-mauve-50 text-mauve-600 ring-mauve-100',
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
      ? 'bg-neutral-100 text-neutral-600'
      : isPositive
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-rose-50 text-rose-700'

  return (
    <article className="metric-card group relative min-w-0 overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-mauve-200/30">
      <div className="pointer-events-none absolute -right-14 -bottom-16 size-36 rounded-full bg-mauve-300/15 opacity-80 blur-3xl transition-opacity duration-200 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <div
          className={`grid size-10 place-items-center rounded-2xl ring-1 ${config.iconClassName}`}
        >
          <config.icon className="size-4.5" aria-hidden="true" />
        </div>
        <div className="-mt-1 -mr-1 opacity-85">
          <Sparkline values={metric.sparkline} color={config.color} />
        </div>
      </div>
      <div className="relative mt-5">
        <p className="text-sm font-medium text-neutral-500">{metric.label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-[1.7rem]">
          {formatMetric(metric)}
        </p>
      </div>
      <div className="relative mt-4 flex min-w-0 items-center gap-2 text-xs">
        {metric.sparkline.length > 1 && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-semibold ${trendClassName}`}
          >
            <TrendIcon className="size-3" aria-hidden="true" />
            {metric.trend.direction === 'flat' ? 'Stable' : `${metric.trend.percentage}%`}
          </span>
        )}
        <span className="truncate text-neutral-500">{metric.trend.label}</span>
      </div>
    </article>
  )
}
