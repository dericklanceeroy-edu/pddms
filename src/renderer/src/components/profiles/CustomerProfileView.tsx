import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import FilteredInput from '@renderer/components/ui/FilteredInput'
import FormField, { RequiredNote } from '@renderer/components/ui/FormField'
import { splitErrors, type FieldErrors } from '@renderer/components/ui/fieldErrors'
import {
  type ClientType,
  type CustomerDiscount,
  type CustomerProfile
} from '@renderer/data/profiles'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { localDate } from '@shared/inventory'
import { newCustomerSchema } from '@shared/schemas'
import { validationIssues } from '@shared/validation'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
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
  clientType: 'retail',
  fullName: '',
  contactPerson: '',
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
  customer,
  initialType = 'retail'
}: {
  customer: CustomerProfile | null
  /** Client type for a new profile, e.g. when opened from the wholesale order form. */
  initialType?: ClientType
}): ReactElement {
  const saveCustomer = useProfileStore((state) => state.saveCustomer)
  const removeCustomer = useProfileStore((state) => state.removeCustomer)
  const navigate = useNavigate()
  const isNew = customer === null

  const [draft, setDraft] = useState(customer ?? { ...emptyCustomer, clientType: initialType })
  const [editing, setEditing] = useState(isNew)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const pharmacy = draft.clientType === 'pharmacy'
  // Note: Problems show as soon as a field is left (or changed after that), not only on Save.
  const liveErrors = useMemo(() => {
    const result = newCustomerSchema.safeParse({
      clientType: draft.clientType,
      fullName: draft.fullName,
      contactPerson: draft.contactPerson.trim() || null,
      phone: draft.phone,
      email: draft.email.trim() || null,
      address: draft.address.trim() || null,
      discountType: draft.discountType,
      discountId: draft.discountType === 'none' ? null : draft.discountId || null,
      discountExpiresAt: draft.discountType === 'none' ? null : draft.discountExpiresAt
    })
    const errors: Record<string, string> = {}
    if (!result.success)
      for (const issue of validationIssues(result.error)) errors[issue.field] ??= issue.message
    return errors
  }, [draft])
  const touch = (field: string): void => setTouched((current) => ({ ...current, [field]: true }))
  const shown = (field: string): string | undefined =>
    fieldErrors[field] || (touched[field] ? liveErrors[field] : undefined)
  const change = (values: Partial<CustomerProfile>): void => {
    setDraft((current) => ({ ...current, ...values }))
    setFieldErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(values)) delete next[key]
      return next
    })
  }

  const discountLabel =
    draft.discountType === 'none'
      ? 'Regular Customer'
      : draft.discountType === 'senior'
        ? 'Senior Citizen'
        : 'PWD'
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
    setFieldErrors({})
    try {
      const saved = await saveCustomer(
        {
          clientType: draft.clientType,
          contactPerson: pharmacy ? draft.contactPerson.trim() : '',
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
      setTouched({})
      setSuccess(
        pharmacy
          ? isNew
            ? 'Pharmacy client added.'
            : 'Pharmacy client updated.'
          : isNew
            ? 'Customer profile added.'
            : 'Customer information updated.'
      )
      if (isNew) {
        await navigate({
          to: '/customers/$customerId',
          params: { customerId: String(saved.id) }
        })
      }
    } catch (cause) {
      const { fields, form } = splitErrors(cause, 'Unable to save the customer.')
      setFieldErrors(fields)
      setError(form)
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
    <DashboardShell
      pageTitle={
        pharmacy
          ? isNew
            ? 'New Pharmacy Client'
            : 'Pharmacy Client'
          : isNew
            ? 'New Customer'
            : 'Customer Profile'
      }
    >
      <div className="space-y-5 sm:space-y-6">
        <Link
          to="/customers"
          className="hover:text-brand-700 inline-flex items-center gap-2 rounded-lg px-1 text-sm font-medium text-slate-500 transition"
        >
          <FiArrowLeft /> Back to Customers
        </Link>

        {success && (
          <div
            role="status"
            className="glass-surface flex items-center gap-3 rounded-lg border-emerald-200/80 px-4 py-3 text-sm text-emerald-800"
          >
            <FiCheckCircle className="shrink-0" />
            {success}
          </div>
        )}

        {editing ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <form noValidate onSubmit={save} className="panel space-y-6 p-6 sm:p-7">
              <div>
                <p className="eyebrow">{pharmacy ? 'Pharmacy Client' : 'Customer Details'}</p>
                <h2 className="section-title mt-2 text-2xl">
                  {isNew
                    ? pharmacy
                      ? 'Add Pharmacy Client'
                      : 'Add Customer Profile'
                    : pharmacy
                      ? 'Edit Pharmacy Client'
                      : 'Edit Customer Profile'}
                </h2>
                <p className="section-subtitle">
                  {pharmacy
                    ? 'Pharmacies that buy from Med Prix by the box. They appear as clients in Wholesale & Deliveries.'
                    : 'Keep contact and eligibility information accurate for a smoother dispensing workflow.'}
                </p>
              </div>
              <RequiredNote />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  label="Client Type"
                  required
                  hint={
                    pharmacy
                      ? 'Another pharmacy that places wholesale orders.'
                      : 'A person who buys at the counter.'
                  }
                >
                  <select
                    className="field"
                    value={draft.clientType}
                    onChange={(event) => {
                      const clientType = event.target.value as ClientType
                      change({
                        clientType,
                        ...(clientType === 'pharmacy'
                          ? { discountType: 'none', discountId: '', discountExpiresAt: null }
                          : { contactPerson: '' })
                      })
                    }}
                  >
                    <option value="retail">Retail Customer</option>
                    <option value="pharmacy">Pharmacy Client (Wholesale)</option>
                  </select>
                </FormField>
                <FormField
                  label={pharmacy ? 'Pharmacy Name' : 'Full Name'}
                  required
                  error={shown('fullName')}
                  hint={
                    pharmacy
                      ? "Letters, numbers, spaces and . , & ( ) / ' % + : -"
                      : 'Letters, spaces, periods, commas, apostrophes and hyphens.'
                  }
                >
                  <FilteredInput
                    key={draft.clientType}
                    rule={pharmacy ? 'catalogText' : 'personName'}
                    required
                    maxLength={120}
                    placeholder={pharmacy ? 'e.g. St. Luke’s Pharmacy' : 'e.g. Juan Dela Cruz'}
                    value={draft.fullName}
                    onBlur={() => touch('fullName')}
                    onValueChange={(fullName) => change({ fullName })}
                  />
                </FormField>
                {pharmacy && (
                  <FormField label="Contact Person" error={shown('contactPerson')}>
                    <FilteredInput
                      rule="personName"
                      maxLength={120}
                      placeholder="e.g. Maria Santos"
                      value={draft.contactPerson}
                      onBlur={() => touch('contactPerson')}
                      onValueChange={(contactPerson) => change({ contactPerson })}
                    />
                  </FormField>
                )}
                <FormField
                  label="Mobile Phone"
                  required
                  error={shown('phone')}
                  hint="11 digits starting with 09. Numbers only."
                >
                  <FilteredInput
                    rule="phone"
                    required
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="e.g. 09171234567"
                    value={draft.phone}
                    onBlur={() => touch('phone')}
                    onValueChange={(phone) => change({ phone })}
                  />
                </FormField>
                <FormField label="Email" error={shown('email')}>
                  <FilteredInput
                    rule="email"
                    type="email"
                    maxLength={254}
                    placeholder={pharmacy ? 'e.g. orders@pharmacy.ph' : 'e.g. juan@example.com'}
                    value={draft.email}
                    onBlur={() => touch('email')}
                    onValueChange={(email) => change({ email })}
                  />
                </FormField>
                {!pharmacy && (
                  <FormField label="Discount Eligibility" required>
                    <select
                      className="field"
                      value={draft.discountType}
                      onChange={(event) =>
                        change({ discountType: event.target.value as CustomerDiscount })
                      }
                    >
                      <option value="none">Regular Customer</option>
                      <option value="senior">Senior Citizen</option>
                      <option value="pwd">PWD</option>
                    </select>
                  </FormField>
                )}
                <FormField
                  label={pharmacy ? 'Delivery Address' : 'Address'}
                  error={shown('address')}
                  hint={pharmacy ? 'Filled in automatically on new wholesale orders.' : undefined}
                  className="sm:col-span-2"
                >
                  <input
                    className="field"
                    maxLength={500}
                    placeholder={'e.g. Pioneer Ave, General Santos City'}
                    value={draft.address}
                    onBlur={() => touch('address')}
                    onChange={(event) => change({ address: event.target.value })}
                  />
                </FormField>
                {!pharmacy && draft.discountType !== 'none' && (
                  <>
                    <FormField
                      label="Discount ID"
                      required
                      error={shown('discountId')}
                      hint="Letters and numbers only, at least 4 characters."
                    >
                      <FilteredInput
                        rule="discountId"
                        required
                        maxLength={40}
                        placeholder={'e.g. SC123456'}
                        value={draft.discountId}
                        onBlur={() => touch('discountId')}
                        onValueChange={(discountId) => change({ discountId })}
                      />
                    </FormField>
                    <FormField
                      label={
                        draft.discountType === 'pwd'
                          ? 'ID Expiry Date'
                          : 'ID Expiry Date (If Printed)'
                      }
                      required={draft.discountType === 'pwd'}
                      showOptional={false}
                      error={shown('discountExpiresAt')}
                    >
                      <input
                        type="date"
                        className="field"
                        min={localDate()}
                        value={draft.discountExpiresAt ?? ''}
                        onBlur={() => touch('discountExpiresAt')}
                        onChange={(event) =>
                          change({ discountExpiresAt: event.target.value || null })
                        }
                      />
                    </FormField>
                  </>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-700"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
                {!isNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(customer ?? emptyCustomer)
                      setError('')
                      setFieldErrors({})
                      setTouched({})
                      setEditing(false)
                    }}
                    className="secondary-button"
                  >
                    Cancel
                  </button>
                )}
                <button disabled={isSaving} className="primary-button disabled:cursor-wait">
                  {isSaving ? 'Saving…' : pharmacy ? 'Save Pharmacy Client' : 'Save Profile'}
                </button>
              </div>
            </form>

            <aside className="grid content-start gap-5 sm:grid-cols-2 xl:grid-cols-1">
              <section className="glass-surface relative overflow-hidden rounded-lg p-6">
                <div className="relative">
                  <div className="text-brand-700 grid size-11 place-items-center rounded-lg border border-slate-200 bg-white shadow-sm">
                    <FiUser />
                  </div>
                  <p className="card-title mt-5">Profile Setup</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Capture the customer’s preferred contact details first, then record discount
                    eligibility when applicable.
                  </p>
                </div>
              </section>
              <section className="panel p-6">
                <div className="bg-brand-50/80 text-brand-700 grid size-11 place-items-center rounded-lg">
                  <FiShield />
                </div>
                <p className="card-title mt-5">Eligibility Details</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Senior Citizen and PWD profiles require a valid discount ID before checkout
                  discounts can be applied.
                </p>
              </section>
            </aside>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-12">
            <section className="panel relative overflow-hidden p-6 sm:p-7 xl:col-span-8">
              <div className="relative flex gap-4 sm:gap-5">
                <div className="border-brand-100 bg-brand-50/85 text-brand-700 grid size-14 shrink-0 place-items-center rounded-lg border text-xl shadow-sm">
                  <FiUser />
                </div>
                <div className="min-w-0">
                  <p className="eyebrow">
                    {pharmacy ? 'Pharmacy client' : 'Customer'} since{' '}
                    {date.format(new Date(draft.createdAt))}
                  </p>
                  <h2 className="page-title mt-2 truncate text-2xl">{draft.fullName}</h2>
                  {pharmacy && draft.contactPerson && (
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      Contact: {draft.contactPerson}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-slate-600 sm:text-base">
                    {draft.phone}
                    {draft.email ? ` · ${draft.email}` : ''}
                  </p>
                </div>
              </div>
            </section>

            <section className="glass-surface relative overflow-hidden rounded-lg p-5 sm:p-6 xl:col-span-4">
              <div className="relative">
                <p className="card-title">Profile Actions</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Make changes to this record or remove it from the active list.
                </p>
                <div className="mt-5 grid gap-2">
                  <button
                    onClick={() => {
                      setSuccess('')
                      setEditing(true)
                    }}
                    className="secondary-button w-full"
                  >
                    <FiEdit2 /> Edit Profile
                  </button>
                  <button onClick={() => setConfirmRemove(true)} className="danger-button w-full">
                    <FiTrash2 /> {pharmacy ? 'Remove Client' : 'Remove Customer'}
                  </button>
                </div>
              </div>
            </section>

            {pharmacy ? (
              <ProfileDetail
                icon={<FiCreditCard />}
                label="Client Type"
                value="Pharmacy (Wholesale)"
                description="Orders are placed in Wholesale & Deliveries, by the box."
              />
            ) : (
              <ProfileDetail
                icon={<FiCreditCard />}
                label="Discount Eligibility"
                value={discountLabel}
                description={discountDetail}
              />
            )}
            <ProfileDetail
              icon={<FiPhone />}
              label="Primary Contact"
              value={draft.phone || 'No phone recorded'}
              description={draft.email || 'No email address recorded'}
            />
            <ProfileDetail
              icon={<FiMapPin />}
              label={pharmacy ? 'Delivery Address' : 'Address'}
              value={draft.address || 'No address recorded'}
              description={
                pharmacy
                  ? 'Default address for wholesale deliveries'
                  : 'Used for the customer record'
              }
            />

            <section className="panel min-w-0 overflow-hidden xl:col-span-12">
              <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h3 className="section-title">Transaction History</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {pharmacy
                      ? 'Counter purchases recorded for this client. Wholesale orders are listed in Wholesale & Deliveries.'
                      : 'Recorded purchases associated with this customer.'}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
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
                  <tbody className="divide-y divide-slate-100">
                    {draft.transactions.map((transaction) => (
                      <tr key={transaction.id} className="transition hover:bg-white">
                        <td className="px-5 py-4 font-medium sm:px-6">{transaction.id}</td>
                        <td className="px-5 py-4 text-slate-500">
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
                  <p className="p-12 text-center text-sm text-slate-500">
                    No transactions recorded.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {confirmRemove && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/55 p-4">
          <button
            className="absolute inset-0"
            aria-label="Cancel customer removal"
            onClick={() => setConfirmRemove(false)}
          />
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-customer-title"
            className="glass-surface relative z-10 w-full max-w-md rounded-lg p-6"
          >
            <h2 id="remove-customer-title" className="text-xl font-semibold">
              {pharmacy ? 'Remove Pharmacy Client?' : 'Remove Customer?'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
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
                {isRemoving ? 'Removing…' : pharmacy ? 'Remove Client' : 'Remove Customer'}
              </button>
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
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
      <div className="relative">
        <div className="text-brand-700 grid size-10 place-items-center rounded-lg border border-slate-200 bg-white shadow-sm">
          {icon}
        </div>
        <p className="mt-5 text-sm text-slate-500">{label}</p>
        <p className="mt-2 text-lg font-semibold break-words text-slate-900">{value}</p>
        <p className="mt-2 text-sm leading-6 break-words text-slate-500">{description}</p>
      </div>
    </section>
  )
}
