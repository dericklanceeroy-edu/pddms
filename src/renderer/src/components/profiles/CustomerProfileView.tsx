import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { type CustomerDiscount, type CustomerProfile } from '@renderer/data/profiles'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactElement } from 'react'
import {
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiEdit2,
  FiMapPin,
  FiPhone,
  FiShield,
  FiTrash2,
  FiUser
} from 'react-icons/fi'

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
  const removeCustomer = useProfileStore((state) => state.removeCustomer)
  const navigate = useNavigate()
  const isNew = customer === null

  const [draft, setDraft] = useState(customer ?? emptyCustomer)
  const [editing, setEditing] = useState(isNew)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const discountLabel =
    draft.discountType === 'none' ? 'Regular customer' : draft.discountType.toUpperCase()
  const discountDetail =
    draft.discountType === 'none'
      ? 'No discount ID registered'
      : `${draft.discountId || 'No discount ID registered'}${draft.discountExpiresAt ? ` · Expires ${date.format(new Date(draft.discountExpiresAt))}` : ''}`

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()

    const fullName = draft.fullName.trim()
    const phone = draft.phone.trim()
    const email = draft.email.trim()
    const discountId = draft.discountId.trim()

    setIsSaving(true)
    setError('')
    try {
      const saved = await saveCustomer(
        {
          fullName,
          phone,
          email,
          address: draft.address.trim(),
          discountType: draft.discountType,
          discountId: draft.discountType === 'none' ? '' : discountId,
          discountExpiresAt: draft.discountType === 'none' ? null : draft.discountExpiresAt
        },
        isNew ? undefined : draft.id
      )

      setDraft(saved)
      setEditing(false)
      setSuccess(isNew ? 'Customer profile added.' : 'Customer information updated.')
      if (isNew) {
        await navigate({
          to: '/customers/$customerId',
          params: { customerId: String(saved.id) }
        })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the customer.')
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    setIsRemoving(true)
    try {
      await removeCustomer(draft.id)
      await navigate({ to: '/customers' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove the customer.')
      setConfirmRemove(false)
      setIsRemoving(false)
    }
  }

  return (
    <DashboardShell pageTitle={isNew ? 'New customer' : 'Customer profile'}>
      <div className="space-y-5 sm:space-y-6">
        <Link
          to="/customers"
          className="inline-flex items-center gap-2 rounded-2xl px-1 text-sm font-medium text-neutral-500 transition hover:text-mauve-700"
        >
          <FiArrowLeft /> Back to customers
        </Link>

        {success && (
          <div
            role="status"
            className="glass-surface flex items-center gap-3 rounded-2xl border-emerald-200/80 px-4 py-3 text-sm text-emerald-800"
          >
            <FiCheckCircle className="shrink-0" />
            {success}
          </div>
        )}

        {editing ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <form noValidate onSubmit={save} className="panel space-y-6 p-6 sm:p-7">
              <div>
                <p className="eyebrow">Customer details</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {isNew ? 'Add customer profile' : 'Edit customer profile'}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
                  Keep contact and eligibility information accurate for a smoother dispensing
                  workflow.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full name">
                  <input
                    required
                    className="field"
                    placeholder={'e.g. Juan Dela Cruz'}
                    value={draft.fullName}
                    onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    required
                    className="field"
                    inputMode={'numeric'}
                    maxLength={11}
                    placeholder={'e.g. 09171234567'}
                    value={draft.phone}
                    onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    className="field"
                    placeholder={'e.g. juan@example.com'}
                    value={draft.email}
                    onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  />
                </Field>
                <Field label="Discount eligibility">
                  <select
                    className="field"
                    value={draft.discountType}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        discountType: event.target.value as CustomerDiscount
                      })
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
                      placeholder={'e.g. Davao City'}
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
                        placeholder={'e.g. SC-123456'}
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
                          setDraft({
                            ...draft,
                            discountExpiresAt: event.target.value || null
                          })
                        }
                      />
                    </Field>
                  </>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-700"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/65 pt-5">
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(customer ?? emptyCustomer)
                      setError('')
                      setEditing(false)
                    }}
                    className="secondary-button"
                  >
                    Cancel
                  </button>
                )}
                <button disabled={isSaving} className="primary-button disabled:cursor-wait">
                  {isSaving ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </form>

            <aside className="grid content-start gap-5 sm:grid-cols-2 xl:grid-cols-1">
              <section className="glass-surface relative overflow-hidden rounded-3xl p-6">
                <div className="absolute -top-10 -right-10 size-28 rounded-full bg-indigo-200/45 blur-2xl" />
                <div className="relative">
                  <div className="grid size-11 place-items-center rounded-2xl border border-white/80 bg-white/65 text-mauve-700 shadow-sm">
                    <FiUser />
                  </div>
                  <p className="mt-5 text-sm font-semibold text-neutral-900">Profile setup</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-500">
                    Capture the customer’s preferred contact details first, then record discount
                    eligibility when applicable.
                  </p>
                </div>
              </section>
              <section className="panel p-6">
                <div className="grid size-11 place-items-center rounded-2xl bg-mauve-50/80 text-mauve-700">
                  <FiShield />
                </div>
                <p className="mt-5 text-sm font-semibold text-neutral-900">Eligibility details</p>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Senior Citizen and PWD profiles require a valid discount ID before checkout
                  discounts can be applied.
                </p>
              </section>
            </aside>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-12">
            <section className="panel relative overflow-hidden p-6 sm:p-7 xl:col-span-8">
              <div className="mesh-glow -top-24 -right-12 size-64 bg-indigo-300/25" />
              <div className="mesh-glow -bottom-32 left-1/4 size-64 bg-mauve-300/20" />
              <div className="relative flex gap-4 sm:gap-5">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-mauve-100 bg-mauve-50/85 text-xl text-mauve-700 shadow-sm">
                  <FiUser />
                </div>
                <div className="min-w-0">
                  <p className="eyebrow">Customer since {date.format(new Date(draft.createdAt))}</p>
                  <h2 className="mt-2 truncate text-3xl font-semibold tracking-tight sm:text-4xl">
                    {draft.fullName}
                  </h2>
                  <p className="mt-3 text-sm text-neutral-600 sm:text-base">
                    {draft.phone}
                    {draft.email ? ` · ${draft.email}` : ''}
                  </p>
                </div>
              </div>
            </section>

            <section className="glass-surface relative overflow-hidden rounded-3xl p-5 sm:p-6 xl:col-span-4">
              <div className="absolute -top-12 -right-10 size-28 rounded-full bg-mauve-200/35 blur-2xl" />
              <div className="relative">
                <p className="eyebrow">Profile actions</p>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Make changes to this customer record or remove it from the active list.
                </p>
                <div className="mt-5 grid gap-2">
                  <button
                    onClick={() => {
                      setSuccess('')
                      setEditing(true)
                    }}
                    className="secondary-button w-full"
                  >
                    <FiEdit2 /> Edit profile
                  </button>
                  <button onClick={() => setConfirmRemove(true)} className="danger-button w-full">
                    <FiTrash2 /> Remove customer
                  </button>
                </div>
              </div>
            </section>

            <ProfileDetail
              icon={<FiCreditCard />}
              label="Discount eligibility"
              value={discountLabel}
              description={discountDetail}
            />
            <ProfileDetail
              icon={<FiPhone />}
              label="Primary contact"
              value={draft.phone || 'No phone recorded'}
              description={draft.email || 'No email address recorded'}
            />
            <ProfileDetail
              icon={<FiMapPin />}
              label="Address"
              value={draft.address || 'No address recorded'}
              description="Used for the customer profile record"
            />

            <section className="panel min-w-0 overflow-hidden xl:col-span-12">
              <header className="flex flex-col gap-3 border-b border-white/65 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h3 className="font-semibold">Transaction history</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Recorded purchases associated with this customer.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-white/75 bg-white/55 px-3 py-1 text-xs font-semibold text-neutral-600">
                  {draft.transactions.length} records
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="surface-header text-left">
                    <tr>
                      <th className="px-5 py-3 sm:px-6">Receipt</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Items</th>
                      <th className="px-5 py-3 text-right sm:px-6">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/65">
                    {draft.transactions.map((transaction) => (
                      <tr key={transaction.id} className="transition hover:bg-white/30">
                        <td className="px-5 py-4 font-medium sm:px-6">{transaction.id}</td>
                        <td className="px-5 py-4 text-neutral-500">
                          {date.format(new Date(transaction.purchasedAt))}
                        </td>
                        <td className="px-5 py-4">{transaction.itemCount}</td>
                        <td className="px-5 py-4 text-right font-medium sm:px-6">
                          {currency.format(transaction.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {draft.transactions.length === 0 && (
                  <p className="p-12 text-center text-sm text-neutral-500">
                    No transactions recorded.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {confirmRemove && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-neutral-950/55 p-4 backdrop-blur-sm">
          <button
            className="absolute inset-0"
            aria-label="Cancel customer removal"
            onClick={() => setConfirmRemove(false)}
          />
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-customer-title"
            className="glass-surface relative z-10 w-full max-w-md rounded-[1.75rem] p-6"
          >
            <h2 id="remove-customer-title" className="text-xl font-semibold">
              Remove customer?
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              {draft.fullName} will be removed from the customer list. This action cannot be undone
              from the database.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={isRemoving}
                onClick={() => setConfirmRemove(false)}
                className="secondary-button disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={isRemoving}
                onClick={() => void remove()}
                className="danger-button disabled:cursor-wait disabled:opacity-60"
              >
                {isRemoving ? 'Removing…' : 'Remove customer'}
              </button>
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  )
}

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block text-[0.72rem] font-semibold tracking-[0.08em] text-neutral-600 uppercase">
      {label}
      <span className="mt-2 block">{children}</span>
    </label>
  )
}

function ProfileDetail({
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
    <section className="panel relative overflow-hidden p-5 sm:p-6 xl:col-span-4">
      <div className="absolute -top-10 -right-10 size-24 rounded-full bg-mauve-200/30 blur-2xl" />
      <div className="relative">
        <div className="grid size-10 place-items-center rounded-2xl border border-white/80 bg-white/65 text-mauve-700 shadow-sm">
          {icon}
        </div>
        <p className="mt-5 text-sm text-neutral-500">{label}</p>
        <p className="mt-2 text-lg font-semibold break-words text-neutral-900">{value}</p>
        <p className="mt-2 text-sm leading-6 break-words text-neutral-500">{description}</p>
      </div>
    </section>
  )
}
