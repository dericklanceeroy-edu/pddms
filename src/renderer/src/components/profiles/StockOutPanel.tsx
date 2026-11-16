import FormField from '@renderer/components/ui/FormField'
import { splitErrors, type FieldErrors } from '@renderer/components/ui/fieldErrors'
import type { ItemProfile } from '@renderer/data/profiles'
import { getStockOuts, recordStockOut } from '@renderer/services/inventory'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { expiryDateLabel, getExpiryStatus, type StockOutRecord } from '@shared/inventory'
import { writeOffReasons, type WriteOffReason } from '@shared/types'
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'

export default function StockOutPanel({ item }: { item: ItemProfile }): ReactElement {
  const [batchId, setBatchId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reasonCode, setReasonCode] = useState<WriteOffReason | ''>('')
  const [reason, setReason] = useState('')
  const [records, setRecords] = useState<StockOutRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
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
    setFieldErrors({})
    setMessage('')
    const stock = item.batches.find((batch) => batch.id === Number(batchId))?.stock
    if (stock !== undefined && Number(quantity) > stock) {
      setFieldErrors({ quantity: `Only ${stock} unit(s) are on hand in this batch.` })
      setSaving(false)
      return
    }
    const chosen = item.batches.find((batch) => batch.id === Number(batchId))
    try {
      if (!reasonCode) {
        setFieldErrors({ reasonCode: 'Choose why the stock is written off.' })
        return
      }
      if (reasonCode === 'expired' && chosen && getExpiryStatus(chosen.expiresAt) !== 'expired') {
        setFieldErrors({
          reasonCode: `This batch has not expired yet (expires ${expiryDateLabel(chosen.expiresAt)}). Choose another reason.`
        })
        return
      }
      await recordStockOut({
        batchId: Number(batchId),
        quantity: Number(quantity),
        reasonCode,
        reason
      })
      setBatchId('')
      setQuantity('')
      setReasonCode('')
      setReason('')
      setMessage('Stock-out recorded.')
      await loadItems(true)
      setRecords(await getStockOuts(item.id))
    } catch (cause) {
      const { fields, form } = splitErrors(cause, 'Unable to record stock-out.')
      setFieldErrors(fields)
      setError(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel min-w-0 space-y-4 p-5">
      <h3 className="section-title text-lg">Write Off Stock</h3>
      <p className="text-sm text-slate-500">
        Record expired, damaged, lost or recalled pieces removed from a batch. Write-offs are added
        up by reason in Reports, Write-offs and Losses. Stock sent back to a supplier is recorded
        under Suppliers &amp; Purchasing, Returns &amp; Credits instead.
      </p>
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField label="Batch" required error={fieldErrors.batchId}>
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
                  {batch.batchNumber} · {batch.stock} on hand · expires{' '}
                  {expiryDateLabel(batch.expiresAt)}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Units to Remove" required error={fieldErrors.quantity}>
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
        </FormField>
        <FormField label="Reason" required error={fieldErrors.reasonCode}>
          <select
            className="field w-full"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as WriteOffReason | '')}
          >
            <option value="">Select reason</option>
            {(Object.keys(writeOffReasons) as WriteOffReason[]).map((code) => (
              <option key={code} value={code}>
                {writeOffReasons[code]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label={reasonCode === 'other' ? 'Describe the Reason' : 'Notes'}
          required={reasonCode === 'other'}
          hint={reasonCode === 'other' ? undefined : 'Optional, e.g. found broken on shelf 3.'}
          error={fieldErrors.reason}
        >
          <input
            className="field"
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        <button className="primary-button w-fit" disabled={saving || !batchId}>
          {saving ? 'Saving…' : 'Record Write-Off'}
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
          Write-off history ({records.length})
        </summary>
        <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto text-sm">
          {records.map((record) => (
            <li key={record.id} className="rounded-md bg-slate-50 p-3 break-words">
              <p className="font-medium">
                {record.batchNumber} · {record.quantity} pcs written off ·{' '}
                {writeOffReasons[record.reasonCode ?? 'other']}
              </p>
              {record.reason && <p>{record.reason}</p>}
              <p className="text-xs text-slate-500">
                {record.createdAt} · {record.recordedByName}
              </p>
            </li>
          ))}
          {!records.length && <li className="text-slate-500">No write-offs recorded.</li>}
        </ul>
      </details>
    </section>
  )
}
