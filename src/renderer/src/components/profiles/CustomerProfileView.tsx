import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { type CustomerDiscount, type CustomerProfile } from '@renderer/data/profiles'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactElement } from 'react'
import { FiArrowLeft, FiEdit2, FiUser } from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

const emptyCustomer: CustomerProfile = {
  id: 0,
  fullName: '',
  phone: '',
  email: '',
  address: '',
  discountType: 'none',
  discountId: '',
  discountExpiresAt: null,
  transactions: [],
  createdAt: new Date().toISOString()
}

export default function CustomerProfileView({
  customer
}: {
  customer: CustomerProfile | null
}): ReactElement {
  const saveCustomer = useProfileStore((state) => state.saveCustomer)
  const navigate = useNavigate()
  const isNew = customer === null
  const [draft, setDraft] = useState(customer ?? { ...emptyCustomer, id: Date.now() })
  const [editing, setEditing] = useState(isNew)

  const save = (event: FormEvent): void => {
    event.preventDefault()
    saveCustomer(draft)
    setEditing(false)
    if (isNew)
      void navigate({ to: '/customers/$customerId', params: { customerId: String(draft.id) } })
  }

  return (
    <DashboardShell pageTitle={isNew ? 'New customer' : 'Customer profile'}>
      <div className="space-y-6">
        <Link
          to="/customers"
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-mauve-700"
        >
          <FiArrowLeft /> Back to customers
        </Link>
        {editing ? (
          <form onSubmit={save} className="panel mx-auto max-w-3xl space-y-5 p-6">
            <div>
              <p className="eyebrow">Customer details</p>
              <h2 className="mt-1 text-2xl font-semibold">
                {isNew ? 'Add customer profile' : 'Edit customer profile'}
              </h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name">
                <input
                  required
                  className="field"
                  value={draft.fullName}
                  onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  required
                  className="field"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="field"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
              </Field>
              <Field label="Discount eligibility">
                <select
                  className="field bg-white"
                  value={draft.discountType}
                  onChange={(event) =>
                    setDraft({ ...draft, discountType: event.target.value as CustomerDiscount })
                  }
                >
                  <option value="none">Regular customer</option>
                  <option value="senior">Senior Citizen</option>
                  <option value="pwd">PWD</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <input
                    className="field"
                    value={draft.address}
                    onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                  />
                </Field>
              </div>
              {draft.discountType !== 'none' && (
                <>
                  <Field label="Discount ID">
                    <input
                      required
                      className="field"
                      value={draft.discountId}
                      onChange={(event) => setDraft({ ...draft, discountId: event.target.value })}
                    />
                  </Field>
                  <Field label="ID expiry (if applicable)">
                    <input
                      type="date"
                      className="field"
                      value={draft.discountExpiresAt ?? ''}
                      onChange={(event) =>
                        setDraft({ ...draft, discountExpiresAt: event.target.value || null })
                      }
                    />
                  </Field>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-5">
              {!isNew && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="secondary-button"
                >
                  Cancel
                </button>
              )}
              <button className="primary-button">Save profile</button>
            </div>
          </form>
        ) : (
          <>
            <section className="panel p-6">
              <div className="flex flex-col justify-between gap-5 sm:flex-row">
                <div className="flex gap-4">
                  <div className="grid size-14 place-items-center rounded-full bg-mauve-50 text-xl text-mauve-700">
                    <FiUser />
                  </div>
                  <div>
                    <p className="eyebrow">
                      Customer since {date.format(new Date(draft.createdAt))}
                    </p>
                    <h2 className="mt-1 text-3xl font-semibold">{draft.fullName}</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {draft.phone}
                      {draft.email ? ` · ${draft.email}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="secondary-button inline-flex h-fit items-center gap-2"
                >
                  <FiEdit2 /> Edit profile
                </button>
              </div>
            </section>
            <section className="grid gap-5 md:grid-cols-2">
              <div className="panel p-5">
                <p className="text-sm text-neutral-500">Discount eligibility</p>
                <p className="mt-2 text-xl font-semibold">
                  {draft.discountType === 'none'
                    ? 'Regular customer'
                    : draft.discountType.toUpperCase()}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {draft.discountId || 'No discount ID registered'}
                </p>
              </div>
              <div className="panel p-5">
                <p className="text-sm text-neutral-500">Address</p>
                <p className="mt-2 font-medium">{draft.address || 'No address recorded'}</p>
              </div>
            </section>
            <section className="panel overflow-hidden">
              <header className="border-b border-neutral-200 p-5">
                <h3 className="font-semibold">Transaction history</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Recorded purchases associated with this customer.
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-neutral-50 text-left">
                    <tr>
                      <th className="px-5 py-3">Receipt</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Items</th>
                      <th className="px-5 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {draft.transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="px-5 py-4 font-medium">{transaction.id}</td>
                        <td className="px-5 py-4 text-neutral-500">
                          {date.format(new Date(transaction.purchasedAt))}
                        </td>
                        <td className="px-5 py-4">{transaction.itemCount}</td>
                        <td className="px-5 py-4 text-right font-medium">
                          {currency.format(transaction.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {draft.transactions.length === 0 && (
                  <p className="p-10 text-center text-sm text-neutral-500">
                    No transactions recorded.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  )
}

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      {children}
    </label>
  )
}
