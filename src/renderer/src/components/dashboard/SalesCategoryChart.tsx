import type { DashboardCategorySale } from '@renderer/data/adminDashboard'
import type { ReactElement } from 'react'
import { FiPieChart } from 'react-icons/fi'

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
})

const categoryColors = ['#2563eb', '#4f46e5', '#38bdf8', '#cbd5e1']

function createGradient(categories: DashboardCategorySale[]): string {
  let offset = 0

  const segments = categories.map((category, index) => {
    const start = offset
    const end = start + category.sharePercentage

    offset = end

    return `${categoryColors[index % categoryColors.length]} ${start}% ${end}%`
  })

  return `conic-gradient(${segments.join(', ')})`
}

export default function SalesCategoryChart({
  categories
}: {
  categories: DashboardCategorySale[]
}): ReactElement {
  const total = categories.reduce((sum, category) => sum + category.salesAmount, 0)
  const gradient = createGradient(categories)

  return (
    <article
      aria-labelledby="sales-category-title"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm"
    >
      <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-5 sm:px-6">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
            <FiPieChart className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <h3 id="sales-category-title" className="font-semibold tracking-tight text-neutral-950">
              Sales by category
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-neutral-500">Recorded revenue mix</p>
          </div>
        </div>
      </header>
      {categories.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 py-14 text-center">
          <div>
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-neutral-100 text-neutral-500">
              <FiPieChart aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-neutral-700">No category sales yet.</p>
            <p className="mt-1 text-xs text-neutral-500">
              Completed sales will populate this chart.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
          <div className="relative mx-auto size-40 shrink-0">
            <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
            <div className="absolute inset-5 grid place-items-center rounded-full bg-white text-center shadow-inner">
              <div>
                <p className="text-[0.65rem] font-medium tracking-wide text-neutral-400 uppercase">
                  Total sales
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">
                  {currencyFormatter.format(total)}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {categories.map((category, index) => (
              <div key={category.id} className="flex items-center gap-3 text-xs">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColors[index % categoryColors.length] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate font-medium text-neutral-600">
                  {category.label}
                </span>
                <span className="font-semibold whitespace-nowrap text-neutral-800 tabular-nums">
                  {currencyFormatter.format(category.salesAmount)}
                </span>
                <span className="w-8 text-right text-neutral-400 tabular-nums">
                  {category.sharePercentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
