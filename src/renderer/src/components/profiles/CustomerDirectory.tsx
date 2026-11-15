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
  const allProfiles = useProfileStore((state) => state.customers)
  // Note: Pharmacy clients (wholesale buyers) are managed in Wholesale & Deliveries.
  const customers = useMemo(
    () => allProfiles.filter((customer) => customer.clientType !== 'pharmacy'),
    [allProfiles]
  )
  const loadCustomers = useProfileStore((state) => state.loadCustomers)
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
    void loadCustomers()
  }, [loadCustomers])

  return (
    <DashboardShell pageTitle="Customers">
      <div className="space-y-5 sm:space-y-6">
        <section className="page-intro">
          <div className="page-intro-content flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="eyebrow">Daily work</p>
              <h2 className="page-title mt-0.5">Customers ({directoryMetrics.total})</h2>
              <p className="page-subtitle">
                People who buy at the counter, with their Senior Citizen or PWD eligibility.
                Pharmacy clients that buy wholesale are managed in{' '}
                <Link to="/wholesale" className="text-brand-700 font-semibold underline">
                  Wholesale &amp; Deliveries
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/customers/$customerId"
                params={{ customerId: 'new' }}
                className="primary-button"
              >
                <FiPlus /> Add Customer
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="panel min-w-0 overflow-hidden">
            <header className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="section-title">Directory</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Search, then open a record to view its details.
                </p>
              </div>
              <span className="border-brand-100 bg-brand-50/80 text-brand-700 w-fit rounded-full border px-3 py-1 text-xs font-semibold">
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

            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:px-6 sm:py-5">
              <label className="relative block min-w-0 flex-1 sm:max-w-xl">
                <FiSearch className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
                <span className="sr-only">Search customers</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, email, or discount ID"
                  className="field mt-0 pl-10"
                />
              </label>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredCustomers.map((customer) => (
                <Link
                  key={customer.id}
                  to="/customers/$customerId"
                  params={{ customerId: String(customer.id) }}
                  className="group flex items-center gap-4 px-5 py-4 transition duration-200 hover:bg-white sm:px-6 sm:py-5"
                >
                  <div className="border-brand-100 bg-brand-50/80 text-brand-700 shadow-brand-100/60 grid size-11 shrink-0 place-items-center rounded-lg border shadow-sm">
                    <FiUser />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{customer.fullName}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {customer.phone}
                      {customer.email ? ` · ${customer.email}` : ''}
                    </p>
                  </div>
                  <span
                    className={`hidden rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${customer.discountType === 'none' ? 'border-slate-200/80 bg-white text-slate-600' : 'border-emerald-100 bg-emerald-50/80 text-emerald-700'}`}
                  >
                    {customer.discountType === 'none'
                      ? 'Regular'
                      : customer.discountType === 'senior'
                        ? 'Senior Citizen'
                        : 'PWD'}
                  </span>
                  <FiChevronRight className="group-hover:text-brand-700 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="px-5 py-14 text-center sm:px-6">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-slate-100/80 text-slate-400">
                    <FiUsers />
                  </div>
                  <p className="mt-4 font-medium text-slate-700">
                    {customers.length ? 'No customers match this search.' : 'No customers yet.'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try another name, contact detail, or discount ID.
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="grid gap-5 sm:grid-cols-3 xl:grid-cols-1">
            <DirectoryMetric
              icon={<FiUsers />}
              label="Retail Customers"
              value={String(directoryMetrics.total)}
              description="People who buy at the counter"
            />
            <DirectoryMetric
              icon={<FiMail />}
              label="With Email"
              value={String(directoryMetrics.emailContacts)}
              description="Customers who can be reached by email"
            />
            <DirectoryMetric
              icon={<FiCreditCard />}
              label="Discount Eligible"
              value={String(directoryMetrics.discountEligible)}
              description="Senior Citizen and PWD profiles"
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
    <section className="glass-surface relative overflow-hidden rounded-lg p-5">
      <div className="relative">
        <div className="text-brand-700 grid size-10 place-items-center rounded-lg border border-slate-200 bg-white shadow-sm">
          {icon}
        </div>
        <p className="mt-5 text-sm font-semibold text-slate-600">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </section>
  )
}
