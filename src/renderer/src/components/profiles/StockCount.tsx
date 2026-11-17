import { useConfirm } from '@renderer/components/ui/ConfirmDialog'
import FormField, { FormError } from '@renderer/components/ui/FormField'
import InfoTip from '@renderer/components/ui/InfoTip'
import Modal from '@renderer/components/ui/Modal'
import type { ItemProfile } from '@renderer/data/profiles'
import {
  cancelStockCount,
  completeStockCount,
  exportCountSheet,
  getStockCount,
  listStockCounts,
  saveStockCountLines,
  startStockCount
} from '@renderer/services/controls'
import type { StockCountDetails, StockCountRecord } from '@shared/controls'
import { expiryDateLabel } from '@shared/inventory'
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { FiPrinter } from 'react-icons/fi'

const when = (value: string): string =>
  new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

const statusTone: Record<StockCountRecord['status'], string> = {
  open: 'bg-amber-50 text-amber-800',
  completed: 'bg-emerald-50 text-emerald-800',
  cancelled: 'bg-slate-100 text-slate-600'
}

/**
 * Physical stock count (administrator). Starting a count records what the system expects in each
 * batch; staff print the count sheet, count the shelves, and enter what they found. Completing the
 * count raises or lowers every batch that differs, each with a reason, all at once.
 */
export default function StockCount({
  items,
  close,
  changed
}: {
  items: ItemProfile[]
  close: VoidFunction
  changed: () => Promise<void>
}): ReactElement {
  const [counts, setCounts] = useState<StockCountRecord[]>([])
  const [open, setOpen] = useState<StockCountDetails | null>(null)
  const [scope, setScope] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(
    () =>
      listStockCounts()
        .then(setCounts)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : 'Unable to load stock counts.')
        ),
    []
  )
  useEffect(() => {
    void load()
  }, [load])
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  if (open)
    return (
      <CountSheet
        count={open}
        close={() => {
          setOpen(null)
          void load()
        }}
        finished={async () => {
          setOpen(null)
          await Promise.all([load(), changed()])
        }}
      />
    )
  return (
    <Modal
      title="Physical Stock Count"
      info="Count what is on the shelves and correct the system stock, up or down, with a reason for each difference."
      close={close}
      size="lg"
      busy={busy}
    >
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-800">Start a Count</h3>
            <InfoTip label="Start a Count">
              The count lists every batch in stock with the quantity the system expects. Print the
              sheet, count, then enter the results.
            </InfoTip>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <FormField label="What to Count">
              <select
                className="field"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="">All products (full count)</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.brandName} · {item.genericName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Notes" hint="e.g. Month-end count, Shelf A">
              <input
                className="field"
                maxLength={300}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </FormField>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const id = await startStockCount(scope ? Number(scope) : null, notes.trim())
                  setNotes('')
                  setOpen(await getStockCount(id))
                })
              }
            >
              Start Count
            </button>
          </div>
        </section>
        <FormError message={error} />
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Counts</h3>
          {counts.length === 0 ? (
            <p className="text-sm text-slate-500">No stock counts yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Count</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2 text-right">Batches</th>
                    <th className="px-3 py-2 text-right">Differences</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {counts.map((count) => (
                    <tr key={count.id}>
                      <td className="px-3 py-2">
                        <p className="font-semibold">#{count.id}</p>
                        <p className="text-xs text-slate-500">
                          {count.scope}
                          {count.notes ? ` · ${count.notes}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {when(count.startedAt)}
                        <span className="block text-xs text-slate-500">{count.startedByName}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {count.countedCount} of {count.lineCount}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{count.differenceCount}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[count.status]}`}
                        >
                          {count.status === 'open'
                            ? 'Open'
                            : count.status === 'completed'
                              ? 'Completed'
                              : 'Cancelled'}
                        </span>
                        {count.closedByName && (
                          <span className="block text-xs text-slate-500">
                            {count.closedByName}
                            {count.closedAt ? `, ${when(count.closedAt)}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="secondary-button text-xs"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => setOpen(await getStockCount(count.id)))
                          }
                        >
                          {count.status === 'open' ? 'Continue' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button type="button" className="secondary-button" onClick={close} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CountSheet({
  count: initial,
  close,
  finished
}: {
  count: StockCountDetails
  close: VoidFunction
  finished: () => Promise<void>
}): ReactElement {
  const [count, setCount] = useState(initial)
  const editable = count.status === 'open'
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(
      count.lines.map((line) => [
        line.batchId,
        { counted: line.counted === null ? '' : String(line.counted), reason: line.reason ?? '' }
      ])
    )
  )
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDialog, confirm] = useConfirm()
  const payload = (): Array<{ batchId: number; counted: number | null; reason: string }> =>
    count.lines.map((line) => {
      const entry = entries[line.batchId]
      return {
        batchId: line.batchId,
        counted: entry.counted.trim() === '' ? null : Number(entry.counted),
        reason: entry.reason.trim()
      }
    })
  const invalid = count.lines.find((line) => {
    const value = entries[line.batchId].counted.trim()
    return value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0)
  })
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    if (invalid) {
      setError(
        `${invalid.productName} batch ${invalid.batchNumber}: enter a whole number of 0 or more.`
      )
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  // Note: A count is compared with the system stock at the moment it was saved (M1). A line not
  // saved yet is compared with the stock now; it is saved as soon as the field is left.
  const isSaved = (line: (typeof count.lines)[number]): boolean =>
    line.counted !== null && entries[line.batchId].counted.trim() === String(line.counted)
  const basis = (line: (typeof count.lines)[number]): number =>
    isSaved(line) ? (line.stockAtCount ?? line.expected) : line.currentStock
  const differences = count.lines.filter((line) => {
    const value = entries[line.batchId].counted.trim()
    return value !== '' && Number(value) !== basis(line)
  })
  const saveLine = async (line: (typeof count.lines)[number]): Promise<void> => {
    const entry = entries[line.batchId]
    const value = entry.counted.trim()
    if (!editable || busy) return
    if (value === (line.counted === null ? '' : String(line.counted))) return
    if (value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0)) return
    try {
      await saveStockCountLines(count.id, [
        {
          batchId: line.batchId,
          counted: value === '' ? null : Number(value),
          reason: entry.reason.trim()
        }
      ])
      setCount(await getStockCount(count.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The count could not be saved.')
    }
  }
  const uncounted = count.lines.filter((line) => entries[line.batchId].counted.trim() === '')
  const complete = async (): Promise<void> => {
    const ok = await confirm({
      title: `Complete count #${count.id}?`,
      message: (
        <>
          <p>
            {differences.length === 0
              ? 'Every counted batch matches the system. No stock will change.'
              : `${differences.length} batch(es) will be corrected to the counted quantity, each with its reason. This is recorded in the audit log.`}
          </p>
          <p className="mt-2">The count is closed afterwards and cannot be edited.</p>
        </>
      ),
      confirmLabel: 'Complete Count'
    })
    if (!ok) return
    await run(async () => {
      await saveStockCountLines(count.id, payload())
      await completeStockCount(count.id)
      await finished()
    })
  }
  return (
    <Modal
      title={`Stock Count #${count.id}`}
      description={`${count.scope} · started ${when(count.startedAt)} by ${count.startedByName}${count.notes ? ` · ${count.notes}` : ''}`}
      close={close}
      size="xl"
      busy={busy}
    >
      <div className="space-y-4">
        {editable ? (
          <p className="flex items-center gap-1 text-sm text-slate-600">
            Enter each batch&apos;s count right after counting its shelf.
            <InfoTip label="Counting">
              Each line is saved when you leave the field, together with the system stock at that
              moment, so sales made during the count are not subtracted twice. Any difference needs
              a reason (for example: found on another shelf, broken, not recorded at sale). Complete
              when every batch is counted.
            </InfoTip>
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            This count is {count.status}. It is shown for reference.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (await exportCountSheet(count.id)) setNotice('Count sheet saved as PDF.')
              })
            }
          >
            <FiPrinter aria-hidden="true" /> Print Count Sheet
          </button>
          <span className="self-center text-xs text-slate-500">
            {count.lines.length - uncounted.length} of {count.lines.length} counted ·{' '}
            {differences.length} difference(s)
          </span>
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Product and Batch</th>
                <th className="px-3 py-2">Expiry</th>
                <th className="px-3 py-2 text-right">At Start (pcs)</th>
                <th className="px-3 py-2 text-right">System Now (pcs)</th>
                <th className="w-32 px-3 py-2">Counted (pcs)</th>
                <th className="px-3 py-2 text-right">Difference</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {count.lines.map((line) => {
                const entry = entries[line.batchId]
                const counted = entry.counted.trim() === '' ? null : Number(entry.counted)
                const difference = counted === null ? null : counted - basis(line)
                const movedSinceCount =
                  editable &&
                  isSaved(line) &&
                  line.stockAtCount !== null &&
                  line.currentStock !== line.stockAtCount
                return (
                  <tr key={line.batchId}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{line.productName}</p>
                      <p className="text-xs text-slate-500">
                        Batch {line.batchNumber} · boxes of {line.piecesPerBox}
                      </p>
                      {movedSinceCount && (
                        <p className="text-xs text-amber-800">
                          System stock was {line.stockAtCount} when counted and is{' '}
                          {line.currentStock} now. The difference is taken from the stock when
                          counted, so later sales are not subtracted twice.
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {expiryDateLabel(line.expiresAt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.expected}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.currentStock}</td>
                    <td className="px-3 py-2">
                      <input
                        className="field mt-0"
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        disabled={!editable}
                        aria-label={`Counted pieces for ${line.productName} batch ${line.batchNumber}`}
                        value={entry.counted}
                        onChange={(event) =>
                          setEntries((current) => ({
                            ...current,
                            [line.batchId]: { ...entry, counted: event.target.value }
                          }))
                        }
                        onBlur={() => void saveLine(line)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${difference === null || difference === 0 ? 'text-slate-500' : difference > 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                    >
                      {difference === null
                        ? '—'
                        : difference === 0
                          ? 'Matches'
                          : `${difference > 0 ? '+' : '−'}${Math.abs(difference)} ${difference > 0 ? 'more' : 'missing'}`}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="field mt-0"
                        maxLength={300}
                        disabled={!editable || !difference}
                        placeholder={difference ? 'Required' : ''}
                        aria-label={`Reason for ${line.productName} batch ${line.batchNumber}`}
                        value={entry.reason}
                        onChange={(event) =>
                          setEntries((current) => ({
                            ...current,
                            [line.batchId]: { ...entry, reason: event.target.value }
                          }))
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {notice && (
          <p role="status" className="text-sm text-emerald-700">
            {notice}
          </p>
        )}
        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {editable && (
            <button
              type="button"
              className="danger-button mr-auto"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  const ok = await confirm({
                    title: `Cancel count #${count.id}?`,
                    message: 'No stock changes. The count is kept in the list as cancelled.',
                    confirmLabel: 'Cancel Count',
                    cancelLabel: 'Keep Counting',
                    tone: 'danger'
                  })
                  if (ok)
                    await run(async () => {
                      await cancelStockCount(count.id)
                      await finished()
                    })
                })()
              }
            >
              Cancel Count
            </button>
          )}
          <button type="button" className="secondary-button" onClick={close} disabled={busy}>
            Back
          </button>
          {editable && (
            <>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await saveStockCountLines(count.id, payload())
                    setCount(await getStockCount(count.id))
                    setNotice('Progress saved.')
                  })
                }
              >
                Save Progress
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy || uncounted.length > 0}
                title={uncounted.length > 0 ? 'Enter a count for every batch first.' : undefined}
                onClick={() => void complete()}
              >
                Complete Count
              </button>
            </>
          )}
        </div>
      </div>
      {confirmDialog}
    </Modal>
  )
}
