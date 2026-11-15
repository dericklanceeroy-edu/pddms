import { useConfirm } from '@renderer/components/ui/ConfirmDialog'
import type { CustomerProfile, ItemProfile } from '@renderer/data/profiles'
import { restoreRecord } from '@renderer/services/controls'
import { getArchivedCustomers, getArchivedProducts } from '@renderer/services/profiles'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { FiRotateCcw } from 'react-icons/fi'

/**
 * Archived products, retail customers and pharmacy clients. They were archived instead of deleted
 * because they have history; they stay on old receipts and reports. Restoring makes them
 * available for new sales and orders again.
 */
export default function ArchivedRecords(): ReactElement {
  const [customers, setCustomers] = useState<CustomerProfile[]>([])
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDialog, confirm] = useConfirm()
  const loadItems = useProfileStore((state) => state.loadItems)
  const loadCustomers = useProfileStore((state) => state.loadCustomers)
  const load = useCallback(
    () =>
      Promise.all([getArchivedCustomers(), getArchivedProducts()])
        .then(([archivedCustomers, archivedProducts]) => {
          setCustomers(archivedCustomers)
          setProducts(archivedProducts)
        })
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : 'Unable to load archived records.')
        ),
    []
  )
  useEffect(() => {
    void load()
  }, [load])
  const restore = async (kind: 'customer' | 'product', id: number, name: string): Promise<void> => {
    const ok = await confirm({
      title: `Restore ${name}?`,
      message: `${name} will be available again for new ${kind === 'product' ? 'sales and orders' : 'sales'}.`,
      confirmLabel: 'Restore'
    })
    if (!ok) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await restoreRecord(kind, id)
      setMessage(`${name} restored.`)
      await Promise.all([load(), kind === 'product' ? loadItems(true) : loadCustomers(true)])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to restore the record.')
    } finally {
      setBusy(false)
    }
  }
  const rows = [
    ...products.map((item) => ({
      key: `p${item.id}`,
      kind: 'product' as const,
      id: item.id,
      name: item.brandName,
      type: 'Product',
      detail: `${item.genericName} · ${item.formulation}`
    })),
    ...customers.map((customer) => ({
      key: `c${customer.id}`,
      kind: 'customer' as const,
      id: customer.id,
      name: customer.fullName,
      type: customer.clientType === 'pharmacy' ? 'Pharmacy client' : 'Retail customer',
      detail: [customer.phone, customer.address].filter(Boolean).join(' · ')
    }))
  ]
  return (
    <section className="panel space-y-4 p-5 sm:p-6" aria-labelledby="archived-title">
      <div>
        <h3 id="archived-title" className="section-title">
          Archived Records
        </h3>
        <p className="section-subtitle">
          Products and customers with history are archived instead of deleted. They stay on old
          receipts and reports and are hidden from new sales and orders. Restore one to use it
          again.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing is archived.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="data-table w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Details</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-2.5 font-medium">{row.name}</td>
                  <td className="px-3 py-2.5">{row.type}</td>
                  <td className="px-3 py-2.5 text-slate-600">{row.detail || '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      className="secondary-button text-xs"
                      disabled={busy}
                      onClick={() => void restore(row.kind, row.id, row.name)}
                    >
                      <FiRotateCcw aria-hidden="true" /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDialog}
    </section>
  )
}
