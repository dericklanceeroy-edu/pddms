import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { getItemStock, getStockStatus, type ItemProfile } from '@renderer/data/profiles'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactElement } from 'react'
import { FiArrowLeft, FiEdit2, FiPackage } from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

export default function ItemProfileView({ item }: { item: ItemProfile }): ReactElement {
  const items = useProfileStore((state) => state.items)
  const updateItem = useProfileStore((state) => state.updateItem)
  const [draft, setDraft] = useState(item)
  const [editing, setEditing] = useState(false)
  const equivalents = items.filter((value) => item.genericEquivalentIds.includes(value.id))
  const stock = getItemStock(item)
  const status = getStockStatus(item)

  const save = (event: FormEvent): void => {
    event.preventDefault()
    updateItem(draft)
    setEditing(false)
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
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === 'in-stock' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
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
              onClick={() => setEditing(true)}
              className="secondary-button inline-flex h-fit items-center gap-2"
            >
              <FiEdit2 /> Edit profile
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
      {editing && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-neutral-950/55 p-4">
          <form
            onSubmit={save}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-xl font-semibold">Edit item profile</h2>
            <label className="block text-sm font-medium">
              Brand name
              <input
                className="field"
                value={draft.brandName}
                onChange={(event) => setDraft({ ...draft, brandName: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Generic name
              <input
                className="field"
                value={draft.genericName}
                onChange={(event) => setDraft({ ...draft, genericName: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Formulation
              <input
                className="field"
                value={draft.formulation}
                onChange={(event) => setDraft({ ...draft, formulation: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Reorder level
              <input
                type="number"
                min="0"
                className="field"
                value={draft.reorderLevel}
                onChange={(event) =>
                  setDraft({ ...draft, reorderLevel: Number(event.target.value) })
                }
              />
            </label>
            <div className="flex justify-end gap-2 pt-3">
              <button type="button" onClick={() => setEditing(false)} className="secondary-button">
                Cancel
              </button>
              <button className="primary-button">Save changes</button>
            </div>
          </form>
        </div>
      )}
    </DashboardShell>
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
