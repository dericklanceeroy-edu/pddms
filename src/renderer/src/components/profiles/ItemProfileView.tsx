import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { getItemStock, getStockStatus, type ItemProfile } from '@renderer/data/profiles'
import { useAccount } from '@renderer/hooks/useAccount'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactElement } from 'react'
import { FiArrowLeft, FiEdit2, FiPackage, FiTrash2, FiX } from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

const emptyItem: ItemProfile = {
  id: 0,
  genericName: '',
  brandName: '',
  category: '',
  formulation: '',
  prescriptionRequired: false,
  controlled: false,
  reorderLevel: 0,
  genericEquivalentIds: [],
  batches: []
}

export default function ItemProfileView({ item }: { item: ItemProfile | null }): ReactElement {
  const items = useProfileStore((state) => state.items)
  const addItem = useProfileStore((state) => state.addItem)
  const updateItem = useProfileStore((state) => state.updateItem)
  const removeItem = useProfileStore((state) => state.removeItem)
  const { account } = useAccount()
  const navigate = useNavigate()
  const isNew = item === null
  const [draft, setDraft] = useState<ItemProfile>(() =>
    item ? item : { ...emptyItem, id: Date.now() }
  )
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const canEdit = account?.role === 'master' || account?.role === 'staff'

  if (isNew) {
    const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault()
      const genericName = draft.genericName.trim()
      const brandName = draft.brandName.trim()
      const category = draft.category.trim()
      const formulation = draft.formulation.trim()

      if (
        items.some(
          (value) =>
            value.brandName.toLowerCase() === brandName.toLowerCase() &&
            value.formulation.toLowerCase() === formulation.toLowerCase()
        )
      ) {
        setError('A product with this brand and formulation already exists.')
        return
      }

      setIsSaving(true)
      setError('')
      try {
        const saved = await addItem({
          genericName,
          brandName,
          category,
          formulation,
          prescriptionRequired: draft.prescriptionRequired,
          controlled: draft.controlled,
          reorderLevel: draft.reorderLevel
        })
        await navigate({ to: '/items/$itemId', params: { itemId: String(saved.id) } })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to add the product.')
        setIsSaving(false)
      }
    }

    return (
      <DashboardShell pageTitle="New product">
        <div className="space-y-5 sm:space-y-6">
          <Link
            to="/inventory"
            className="inline-flex items-center gap-2 rounded-2xl px-1 text-sm font-medium text-neutral-500 transition hover:text-mauve-700"
          >
            <FiArrowLeft /> Back to inventory
          </Link>
          <form noValidate onSubmit={save} className="panel mx-auto max-w-3xl space-y-6 p-6 sm:p-7">
            <div>
              <p className="eyebrow">Item details</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Add new product
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-500">
                Create the product profile. Stock is recorded separately through inventory batches.
              </p>
            </div>
            <ProductFields
              draft={draft}
              update={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
            />
            {error && (
              <p
                role="alert"
                className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/65 pt-5">
              <Link to="/inventory" className="secondary-button">
                Cancel
              </Link>
              <button
                disabled={isSaving}
                className="primary-button disabled:cursor-wait disabled:opacity-60"
              >
                {isSaving ? 'Adding product…' : 'Add product'}
              </button>
            </div>
          </form>
        </div>
      </DashboardShell>
    )
  }

  const equivalents = items.filter((value) => item.genericEquivalentIds.includes(value.id))
  const stock = getItemStock(item)
  const status = getStockStatus(item)
  const remove = async (): Promise<void> => {
    setIsRemoving(true)
    try {
      await removeItem(item.id)
      await navigate({ to: '/inventory' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove the product.')
      setConfirmRemove(false)
      setIsRemoving(false)
    }
  }

  const saveEdit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const genericName = draft.genericName.trim()
    const brandName = draft.brandName.trim()
    const category = draft.category.trim()
    const formulation = draft.formulation.trim()
    if (
      items.some(
        (value) =>
          value.id !== item.id &&
          value.brandName.toLowerCase() === brandName.toLowerCase() &&
          value.formulation.toLowerCase() === formulation.toLowerCase()
      )
    ) {
      setError('A product with this brand and formulation already exists.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const saved = await updateItem(item.id, {
        genericName,
        brandName,
        category,
        formulation,
        prescriptionRequired: draft.prescriptionRequired,
        controlled: draft.controlled,
        reorderLevel: draft.reorderLevel
      })
      setDraft({ ...saved, batches: item.batches })
      setIsEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the product.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DashboardShell pageTitle="Item profile">
      <div className="space-y-5 sm:space-y-6">
        <Link
          to="/inventory"
          className="inline-flex items-center gap-2 rounded-2xl px-1 text-sm font-medium text-neutral-500 transition hover:text-mauve-700"
        >
          <FiArrowLeft /> Back to inventory
        </Link>
        <section className="panel relative overflow-hidden p-6 sm:p-7">
          <div className="mesh-glow -top-24 -right-12 size-64 bg-indigo-300/25" />
          <div className="mesh-glow -bottom-32 left-1/4 size-64 bg-mauve-300/20" />
          <div className="relative flex flex-col justify-between gap-5 md:flex-row">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow">{item.category}</p>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${status === 'in-stock' ? 'border-emerald-100 bg-emerald-50/80 text-emerald-700' : status === 'low-stock' ? 'border-amber-100 bg-amber-50/80 text-amber-700' : 'border-rose-100 bg-rose-50/80 text-rose-700'}`}
                >
                  {status.replaceAll('-', ' ')}
                </span>
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {item.brandName}
              </h2>
              <p className="mt-3 text-sm text-neutral-600 sm:text-base">
                {item.genericName} · {item.formulation}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {item.prescriptionRequired && (
                  <span className="rounded-xl border border-violet-100 bg-violet-50/80 px-3 py-1.5 text-xs font-semibold text-violet-700">
                    Prescription required
                  </span>
                )}
                {item.controlled && (
                  <span className="rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-1.5 text-xs font-semibold text-rose-700">
                    Controlled medicine
                  </span>
                )}
              </div>
            </div>
            <div className="glass-surface flex h-fit flex-wrap gap-2 rounded-3xl p-3">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(item)
                    setError('')
                    setIsEditing(true)
                  }}
                  className="secondary-button whitespace-nowrap"
                >
                  <FiEdit2 /> Edit product
                </button>
              )}
              {account?.role === 'master' && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="danger-button whitespace-nowrap"
                >
                  <FiTrash2 /> Remove product
                </button>
              )}
            </div>
          </div>
        </section>
        {isEditing && (
          <form
            noValidate
            onSubmit={(event) => void saveEdit(event)}
            className="panel mx-auto max-w-3xl space-y-6 p-6 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Item details</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Edit product
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-500">
                  Update catalog information without changing stock batch history.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsEditing(false)}
                aria-label="Cancel editing"
              >
                <FiX />
              </button>
            </div>
            <ProductFields
              draft={draft}
              update={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
            />
            {error && (
              <p
                role="alert"
                className="rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/65 pt-5">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
              <button
                disabled={isSaving}
                className="primary-button disabled:cursor-wait disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
        <section className="grid gap-5 md:grid-cols-3">
          <Metric label="Available stock" value={`${stock} units`} />
          <Metric label="Reorder level" value={`${item.reorderLevel} units`} />
          <Metric
            label="Current price"
            value={item.batches[0] ? currency.format(item.batches[0].sellPrice) : 'Unavailable'}
          />
        </section>
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
          <div className="panel min-w-0 overflow-hidden">
            <Header
              title="Stock batches"
              description="Batch-level stock follows first-expiry, first-out dispensing."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="surface-header text-left">
                  <tr>
                    <th className="px-5 py-3">Batch</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3">Stock</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/65">
                  {item.batches.map((batch) => (
                    <tr key={batch.id} className="transition hover:bg-white/30">
                      <td className="px-5 py-4 font-medium">{batch.batchNumber}</td>
                      <td className="px-5 py-4 text-neutral-500">{batch.supplier}</td>
                      <td className="px-5 py-4">{batch.stock}</td>
                      <td className="px-5 py-4">{currency.format(batch.sellPrice)}</td>
                      <td className="px-5 py-4">{date.format(new Date(batch.expiresAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {item.batches.length === 0 && (
                <p className="p-10 text-center text-sm text-neutral-500">
                  No active stock batches.
                </p>
              )}
            </div>
          </div>
          <div className="panel min-w-0 overflow-hidden">
            <Header
              title="Generic equivalents"
              description="Products sharing the same generic formulation."
            />
            <div className="divide-y divide-white/65">
              {equivalents.map((equivalent) => (
                <Link
                  key={equivalent.id}
                  to="/items/$itemId"
                  params={{ itemId: String(equivalent.id) }}
                  className="group flex items-center gap-3 p-5 transition hover:bg-white/45"
                >
                  <div className="grid size-10 place-items-center rounded-2xl bg-mauve-50/80 text-mauve-700">
                    <FiPackage />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{equivalent.brandName}</p>
                    <p className="text-xs text-neutral-500">{equivalent.formulation}</p>
                  </div>
                </Link>
              ))}
              {equivalents.length === 0 && (
                <p className="p-5 text-sm text-neutral-500">No equivalent products recorded.</p>
              )}
            </div>
          </div>
        </section>
      </div>
      {confirmRemove && (
        <ConfirmationDialog
          title="Remove product?"
          description={`${item.brandName} will be removed from the active product catalog.`}
          confirmLabel={isRemoving ? 'Removing…' : 'Remove product'}
          disabled={isRemoving}
          close={() => setConfirmRemove(false)}
          confirm={() => void remove()}
        />
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

type EditableProductField =
  | 'brandName'
  | 'genericName'
  | 'category'
  | 'formulation'
  | 'reorderLevel'
  | 'prescriptionRequired'
  | 'controlled'

function ProductFields({
  draft,
  update
}: {
  draft: ItemProfile
  update: (field: EditableProductField, value: string | number | boolean) => void
}): ReactElement {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Brand name">
        <input
          required
          className="field"
          placeholder={'e.g. Biogesic'}
          value={draft.brandName}
          onChange={(event) => update('brandName', event.target.value)}
        />
      </Field>
      <Field label="Generic name">
        <input
          required
          className="field"
          placeholder={'e.g. Paracetamol'}
          value={draft.genericName}
          onChange={(event) => update('genericName', event.target.value)}
        />
      </Field>
      <Field label="Category">
        <input
          required
          className="field"
          placeholder={'e.g. Analgesics'}
          value={draft.category}
          onChange={(event) => update('category', event.target.value)}
        />
      </Field>
      <Field label="Formulation">
        <input
          required
          className="field"
          placeholder="e.g. 500 mg tablet"
          value={draft.formulation}
          onChange={(event) => update('formulation', event.target.value)}
        />
      </Field>
      <Field label="Reorder level">
        <input
          required
          type="number"
          min="0"
          step="1"
          className="field"
          placeholder={'e.g. 10'}
          value={draft.reorderLevel}
          onChange={(event) =>
            update(
              'reorderLevel',
              event.target.value === '' ? Number.NaN : Number(event.target.value)
            )
          }
        />
      </Field>
      <section className="rounded-2xl border border-white/80 bg-white/40 p-4 shadow-inner shadow-white/50 sm:col-span-2">
        <p className="text-[0.72rem] font-semibold tracking-[0.08em] text-neutral-600 uppercase">
          Dispensing controls
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          <label className="flex items-center gap-3 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={draft.prescriptionRequired}
              onChange={(event) => update('prescriptionRequired', event.target.checked)}
              className="size-4 rounded border-neutral-300 text-mauve-700"
            />
            Prescription required
          </label>
          <label className="flex items-center gap-3 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={draft.controlled}
              onChange={(event) => update('controlled', event.target.checked)}
              className="size-4 rounded border-neutral-300 text-mauve-700"
            />
            Controlled medicine
          </label>
        </div>
      </section>
    </div>
  )
}

function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  disabled,
  close,
  confirm
}: {
  title: string
  description: string
  confirmLabel: string
  disabled: boolean
  close: VoidFunction
  confirm: VoidFunction
}): ReactElement {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-neutral-950/55 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" aria-label="Cancel removal" onClick={close} />
      <section
        role="alertdialog"
        aria-modal="true"
        className="glass-surface relative z-10 w-full max-w-md rounded-[1.75rem] p-6"
      >
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            disabled={disabled}
            onClick={close}
            className="secondary-button disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={disabled}
            onClick={confirm}
            className="danger-button disabled:cursor-wait disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -top-10 -right-10 size-24 rounded-full bg-indigo-200/30 blur-2xl" />
      <div className="relative">
        <p className="text-sm text-neutral-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      </div>
    </div>
  )
}

function Header({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <header className="border-b border-white/65 px-5 py-5 sm:px-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </header>
  )
}
