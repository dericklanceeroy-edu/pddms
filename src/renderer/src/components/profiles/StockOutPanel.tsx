import type { ItemProfile } from '@renderer/data/profiles'
import { getStockOuts, recordStockOut } from '@renderer/services/inventory'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import type { StockOutRecord } from '@shared/inventory'
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'

export default function StockOutPanel({ item }: { item: ItemProfile }): ReactElement {
  const [batchId, setBatchId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [records, setRecords] = useState<StockOutRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const loadItems = useProfileStore((state) => state.loadItems)
  useEffect(() => {
    let active = true
    void getStockOuts(item.id)
      .then((rows) => {
        if (active) setRecords(rows)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load history.')
      })
    return () => {
      active = false
    }
  }, [item.id])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await recordStockOut({ batchId: Number(batchId), quantity: Number(quantity), reason })
      setBatchId('')
      setQuantity('')
      setReason('')
      setMessage('Stock-out recorded.')
      await loadItems(true)
      setRecords(await getStockOuts(item.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record stock-out.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel min-w-0 space-y-4 p-5">
      <h3 className="font-semibold">Stock-out adjustments</h3>
      <p className="text-sm text-neutral-500">
        Record damaged, expired, returned, or missing units removed from a batch.
      </p>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium">
          Batch
          <select
            className="field w-full"
            required
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
          >
            <option value="">Select batch</option>
            {item.batches
              .filter((batch) => batch.stock > 0)
              .map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchNumber} · {batch.stock} on hand
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Units to remove
          <input
            className="field"
            required
            type="number"
            min="1"
            step="1"
            max={item.batches.find((batch) => batch.id === Number(batchId))?.stock}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Reason
          <textarea
            className="field"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button className="primary-button w-fit" disabled={saving || !batchId}>
          {saving ? 'Saving…' : 'Record stock-out'}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Stock-out history ({records.length})
        </summary>
        <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto text-sm">
          {records.map((record) => (
            <li key={record.id} className="rounded-xl bg-neutral-50 p-3 break-words">
              <p className="font-medium">
                {record.batchNumber} · {record.quantity} units removed
              </p>
              <p>{record.reason}</p>
              <p className="text-xs text-neutral-500">
                {record.createdAt} · {record.recordedByName}
              </p>
            </li>
          ))}
          {!records.length && (
            <li className="text-neutral-500">No stock-out adjustments recorded.</li>
          )}
        </ul>
      </details>
    </section>
  )
}
