import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  FiChevronRight,
  FiCreditCard,
  FiMail,
  FiPlus,
  FiSearch,
  FiUser,
  FiUsers
} from 'react-icons/fi'

export default function CustomerDirectory(): ReactElement {
  const customers = useProfileStore((state) => state.customers)
  const load = useProfileStore((state) => state.load)
  const loadError = useProfileStore((state) => state.error)

  const [query, setQuery] = useState('')

  const filteredCustomers = useMemo(() => {
    const search = query.trim().toLowerCase()

    return customers.filter(
      (customer) =>
        !search ||
        `${customer.fullName} ${customer.phone} ${customer.email} ${customer.discountId}`
          .toLowerCase()
          .includes(search)
    )
  }, [customers, query])

  const directoryMetrics = useMemo(() => {
    const discountEligible = customers.filter((customer) => customer.discountType !== 'none').length
    const emailContacts = customers.filter((customer) => Boolean(customer.email)).length

    return {
      total: customers.length,
      discountEligible,
      emailContacts
    }
  }, [customers])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <DashboardShell pageTitle="Customer profiles">
      <div className="space-y-5 sm:space-y-6">
        <section className="page-intro p-6 sm:p-7">
          <div className="mesh-glow -top-28 -right-24 size-72 bg-indigo-300/30" />
          <div className="mesh-glow -bottom-36 left-1/4 size-72 bg-mauve-300/25" />
          <div className="page-intro-content flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="eyebrow">Customer records</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Customer profiles
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-600 sm:text-base">
                Keep customer details, discount eligibility, and purchase history organized in one
                trusted workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="glass-surface rounded-2xl px-4 py-2.5">
                <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
                  Records
                </p>
                <p className="mt-1 text-lg font-semibold text-neutral-900">
                  {directoryMetrics.total}
                </p>
              </div>
              <Link
                to="/customers/$customerId"
                params={{ customerId: 'new' }}
                className="primary-button"
              >
                <FiPlus /> Add customer
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="panel min-w-0 overflow-hidden">
            <header className="flex flex-col gap-4 border-b border-white/65 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="font-semibold">Directory</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Search and open a customer record to view its details.
                </p>
              </div>
              <span className="w-fit rounded-full border border-mauve-100 bg-mauve-50/80 px-3 py-1 text-xs font-semibold text-mauve-700">
                {filteredCustomers.length} shown
              </span>
            </header>

            {loadError && (
              <p
                role="alert"
                className="border-b border-rose-200/80 bg-rose-50/80 px-5 py-3 text-sm text-rose-700"
              >
                {loadError}
              </p>
            )}

            <div className="border-b border-white/65 p-4 sm:px-6 sm:py-5">
              <label className="relative block max-w-xl">
                <FiSearch className="absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-400" />
                <span className="sr-only">Search customers</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, email, or discount ID"
                  className="field mt-0 pl-10"
                />
              </label>
            </div>

            <div className="divide-y divide-white/65">
              {filteredCustomers.map((customer) => (
                <Link
                  key={customer.id}
                  to="/customers/$customerId"
                  params={{ customerId: String(customer.id) }}
                  className="group flex items-center gap-4 px-5 py-4 transition duration-200 hover:bg-white/45 sm:px-6 sm:py-5"
                >
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-mauve-100 bg-mauve-50/80 text-mauve-700 shadow-sm shadow-mauve-100/60">
                    <FiUser />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900">{customer.fullName}</p>
                    <p className="mt-1 truncate text-sm text-neutral-500">
                      {customer.phone}
                      {customer.email ? ` · ${customer.email}` : ''}
                    </p>
                  </div>
                  <span
                    className={`hidden rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${customer.discountType === 'none' ? 'border-neutral-200/80 bg-white/60 text-neutral-600' : 'border-emerald-100 bg-emerald-50/80 text-emerald-700'}`}
                  >
                    {customer.discountType === 'none'
                      ? 'Regular'
                      : customer.discountType.toUpperCase()}
                  </span>
                  <FiChevronRight className="shrink-0 text-neutral-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-mauve-700" />
                </Link>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="px-5 py-14 text-center sm:px-6">
                  <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-neutral-100/80 text-neutral-400">
                    <FiUsers />
                  </div>
                  <p className="mt-4 font-medium text-neutral-700">
                    No customers match this search.
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Try another name, contact detail, or discount ID.
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="grid gap-5 sm:grid-cols-3 xl:grid-cols-1">
            <DirectoryMetric
              icon={<FiUsers />}
              label="Customer base"
              value={String(directoryMetrics.total)}
              description="Customer profiles on record"
            />
            <DirectoryMetric
              icon={<FiCreditCard />}
              label="Discount eligible"
              value={String(directoryMetrics.discountEligible)}
              description="Senior Citizen and PWD profiles"
            />
            <DirectoryMetric
              icon={<FiMail />}
              label="Email contacts"
              value={String(directoryMetrics.emailContacts)}
              description="Profiles with an email address"
            />
          </aside>
        </div>
      </div>
    </DashboardShell>
  )
}

function DirectoryMetric({
  icon,
  label,
  value,
  description
}: {
  icon: ReactElement
  label: string
  value: string
  description: string
}): ReactElement {
  return (
    <section className="glass-surface relative overflow-hidden rounded-3xl p-5">
      <div className="absolute -top-8 -right-8 size-24 rounded-full bg-mauve-200/35 blur-2xl" />
      <div className="relative">
        <div className="grid size-10 place-items-center rounded-2xl border border-white/80 bg-white/65 text-mauve-700 shadow-sm">
          {icon}
        </div>
        <p className="mt-5 text-sm text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">{value}</p>
        <p className="mt-2 text-xs leading-5 text-neutral-500">{description}</p>
      </div>
    </section>
  )
}
