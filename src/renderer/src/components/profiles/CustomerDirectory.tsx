import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { FiChevronRight, FiPlus, FiSearch, FiUser } from 'react-icons/fi'

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
        `${customer.fullName} ${customer.phone} ${customer.discountId}`
          .toLowerCase()
          .includes(search)
    )
  }, [customers, query])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <DashboardShell pageTitle="Customer profiles">
      <div className="space-y-6">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Customer records</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Customer profiles
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              Maintain customer details, discount eligibility, and transaction history.
            </p>
          </div>
          <Link
            to="/customers/$customerId"
            params={{ customerId: 'new' }}
            className="primary-button"
          >
            <FiPlus /> Add customer
          </Link>
        </section>
        <section className="panel overflow-hidden">
          {loadError && (
            <p
              role="alert"
              className="border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              {loadError}
            </p>
          )}
          <div className="border-b border-neutral-200 p-4">
            <label className="relative block max-w-xl">
              <FiSearch className="absolute top-3 left-3.5 text-neutral-400" />
              <span className="sr-only">Search customers</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, phone, or discount ID"
                className="field mt-0 pl-10"
              />
            </label>
          </div>
          <div className="divide-y divide-neutral-100">
            {filteredCustomers.map((customer) => (
              <Link
                key={customer.id}
                to="/customers/$customerId"
                params={{ customerId: String(customer.id) }}
                className="flex items-center gap-4 p-5 hover:bg-neutral-50"
              >
                <div className="grid size-11 place-items-center rounded-full bg-mauve-50 text-mauve-700">
                  <FiUser />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{customer.fullName}</p>
                  <p className="text-sm text-neutral-500">{customer.phone}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${customer.discountType === 'none' ? 'bg-neutral-100 text-neutral-600' : 'bg-emerald-50 text-emerald-700'}`}
                >
                  {customer.discountType === 'none'
                    ? 'Regular'
                    : customer.discountType.toUpperCase()}
                </span>
                <FiChevronRight className="text-neutral-400" />
              </Link>
            ))}
            {filteredCustomers.length === 0 && (
              <p className="p-10 text-center text-sm text-neutral-500">
                No customers match your search.
              </p>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
