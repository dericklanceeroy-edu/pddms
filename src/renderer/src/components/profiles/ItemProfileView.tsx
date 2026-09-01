import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { getItemStock, getStockStatus, type ItemProfile } from '@renderer/data/profiles'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactElement } from 'react'
import { FiArrowLeft, FiPackage, FiTrash2 } from 'react-icons/fi'

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
  const removeItem = useProfileStore((state) => state.removeItem)
  const navigate = useNavigate()
  const isNew = item === null
  const [draft, setDraft] = useState<ItemProfile>(() =>
    item ? item : { ...emptyItem, id: Date.now() }
  )
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  if (isNew) {
    const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault()
      const genericName = draft.genericName.trim()
      const brandName = draft.brandName.trim()
      const category = draft.category.trim()
      const formulation = draft.formulation.trim()

      if (!genericName || !brandName || !category || !formulation) {
        setError('Complete all required product details.')
        return
      }
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
        <div className="space-y-6">
          <Link
            to="/inventory"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-mauve-700"
          >
            <FiArrowLeft /> Back to inventory
          </Link>
          <form onSubmit={save} className="panel mx-auto max-w-3xl space-y-5 p-6">
            <div>
              <p className="eyebrow">Item details</p>
              <h2 className="mt-1 text-2xl font-semibold">Add new product</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Create the product profile. Stock is recorded separately through inventory batches.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Brand name">
                <input
                  required
                  className="field"
                  value={draft.brandName}
                  onChange={(event) => setDraft({ ...draft, brandName: event.target.value })}
                />
              </Field>
              <Field label="Generic name">
                <input
                  required
                  className="field"
                  value={draft.genericName}
                  onChange={(event) => setDraft({ ...draft, genericName: event.target.value })}
                />
              </Field>
              <Field label="Category">
                <input
                  required
                  className="field"
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
              </Field>
              <Field label="Formulation">
                <input
                  required
                  className="field"
                  placeholder="e.g. 500 mg tablet"
                  value={draft.formulation}
                  onChange={(event) => setDraft({ ...draft, formulation: event.target.value })}
                />
              </Field>
              <Field label="Reorder level">
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  className="field"
                  value={draft.reorderLevel}
                  onChange={(event) =>
                    setDraft({ ...draft, reorderLevel: Number(event.target.value) })
                  }
                />
              </Field>
              <div className="flex flex-col justify-end gap-3 pb-2">
                <label className="flex items-center gap-3 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={draft.prescriptionRequired}
                    onChange={(event) =>
                      setDraft({ ...draft, prescriptionRequired: event.target.checked })
                    }
                    className="size-4 rounded border-neutral-300 text-mauve-700"
                  />
                  Prescription required
                </label>
                <label className="flex items-center gap-3 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={draft.controlled}
                    onChange={(event) => setDraft({ ...draft, controlled: event.target.checked })}
                    className="size-4 rounded border-neutral-300 text-mauve-700"
                  />
                  Controlled medicine
                </label>
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-5">
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

  return (
    <DashboardShell pageTitle="Item profile">
      <div className="space-y-6">
        <Link
          to="/inventory"
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-mauve-700"
        >
          <FiArrowLeft /> Back to inventory
        </Link>
        <section className="panel p-6">
          <div className="flex flex-col justify-between gap-5 md:flex-row">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow">{item.category}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === 'in-stock' ? 'bg-emerald-50 text-emerald-700' : status === 'low-stock' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}
                >
                  {status.replaceAll('-', ' ')}
                </span>
              </div>
              <h2 className="mt-2 text-3xl font-semibold">{item.brandName}</h2>
              <p className="mt-1 text-neutral-500">
                {item.genericName} · {item.formulation}
              </p>
              <div className="mt-4 flex gap-2">
                {item.prescriptionRequired && (
                  <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs text-violet-700">
                    Prescription required
                  </span>
                )}
                {item.controlled && (
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs text-rose-700">
                    Controlled medicine
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setConfirmRemove(true)}
              className="inline-flex h-fit items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 font-medium text-rose-700 transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-200"
            >
              <FiTrash2 /> Remove product
            </button>
          </div>
        </section>
        <section className="grid gap-5 md:grid-cols-3">
          <Metric label="Available stock" value={`${stock} units`} />
          <Metric label="Reorder level" value={`${item.reorderLevel} units`} />
          <Metric
            label="Current price"
            value={item.batches[0] ? currency.format(item.batches[0].sellPrice) : 'Unavailable'}
          />
        </section>
        <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div className="panel overflow-hidden">
            <Header
              title="Stock batches"
              description="Batch-level stock follows first-expiry, first-out dispensing."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-neutral-50 text-left">
                  <tr>
                    <th className="px-5 py-3">Batch</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3">Stock</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {item.batches.map((batch) => (
                    <tr key={batch.id}>
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
          <div className="panel">
            <Header
              title="Generic equivalents"
              description="Products sharing the same generic formulation."
            />
            <div className="divide-y divide-neutral-100">
              {equivalents.map((equivalent) => (
                <Link
                  key={equivalent.id}
                  to="/items/$itemId"
                  params={{ itemId: String(equivalent.id) }}
                  className="flex items-center gap-3 p-5 hover:bg-neutral-50"
                >
                  <FiPackage className="text-mauve-600" />
                  <div>
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
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      {children}
    </label>
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
        className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
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
            className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-60"
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
    <div className="panel p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function Header({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <header className="border-b border-neutral-200 p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </header>
  )
}
