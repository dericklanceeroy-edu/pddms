import FormField, { FormError, RequiredNote } from '@renderer/components/ui/FormField'
import Modal from '@renderer/components/ui/Modal'
import { EmptyState } from '@renderer/components/ui/PageHeader'
import { splitErrors, type FieldErrors } from '@renderer/components/ui/fieldErrors'
import type { useSupplierOrders } from '@renderer/hooks/useSupplierOrders'
import {
  applyCreditNote,
  getSupplierReturns,
  recordCreditNote,
  recordSupplierReturn
} from '@renderer/services/controls'
import type { CreditNoteRecord, SupplierReturnRecord } from '@shared/controls'
import { filterInput } from '@shared/inputRules'
import { localDate } from '@shared/inventory'
import { supplierReturnReasons, type SupplierReturnReason } from '@shared/types'
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { FiCornerUpLeft, FiFileText } from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })
const showDate = (value: string): string => date.format(new Date(`${value.slice(0, 10)}T00:00:00`))

type Procurement = ReturnType<typeof useSupplierOrders>

/**
 * Supplier returns and credit notes (administrator only). A return takes pieces out of the batch
 * they came from and records why. The supplier's credit note lowers what is owed: on a chosen
 * purchase order, or kept and applied to the next one.
 */
export default function SupplierReturns({
  procurement,
  query,
  feedback
}: {
  procurement: Procurement
  query: string
  feedback: (message: string, tone?: 'success' | 'error') => void
}): ReactElement {
  const [returns, setReturns] = useState<SupplierReturnRecord[]>([])
  const [credits, setCredits] = useState<CreditNoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<'return' | 'credit' | CreditNoteRecord | null>(null)
  const load = useCallback(
    () =>
      getSupplierReturns()
        .then((result) => {
          setReturns(result.returns)
          setCredits(result.creditNotes)
        })
        .catch((cause: unknown) =>
          feedback(
            cause instanceof Error ? cause.message : 'Unable to load supplier returns.',
            'error'
          )
        )
        .finally(() => setLoading(false)),
    [feedback]
  )
  useEffect(() => {
    void load()
  }, [load])
  const term = query.trim().toLowerCase()
  const shownCredits = credits.filter(
    (credit) =>
      !term ||
      `${credit.creditNoteNumber} ${credit.supplierName} ${credit.orderNumber ?? ''}`
        .toLowerCase()
        .includes(term)
  )
  const shownReturns = returns.filter(
    (item) =>
      !term ||
      `${item.supplierName} ${item.productName} ${item.batchNumber} ${item.creditNoteNumber ?? ''}`
        .toLowerCase()
        .includes(term)
  )
  const done = async (message: string): Promise<void> => {
    setDialog(null)
    feedback(message)
    await Promise.all([load(), procurement.refresh()])
  }
  const kept = credits.filter((credit) => !credit.purchaseOrderId)
  return (
    <div className="space-y-6 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm text-slate-600">
          Record stock sent back first; it leaves inventory right away. When the supplier issues a
          credit note, record it here and link the returns it covers. A credit lowers the balance of
          the purchase order you apply it to.
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="secondary-button" onClick={() => setDialog('return')}>
            <FiCornerUpLeft aria-hidden="true" /> Record Return
          </button>
          <button type="button" className="primary-button" onClick={() => setDialog('credit')}>
            <FiFileText aria-hidden="true" /> Record Credit Note
          </button>
        </div>
      </div>
      {kept.length > 0 && (
        <p
          role="status"
          className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
        >
          {kept.length} credit note{kept.length === 1 ? ' is' : 's are'} kept for a later order,
          worth {currency.format(kept.reduce((sum, credit) => sum + credit.amount, 0))}. Apply them
          when the next order from that supplier is due.
        </p>
      )}
      <section aria-labelledby="credit-notes-title">
        <h3 id="credit-notes-title" className="section-title mb-2">
          Credit Notes
        </h3>
        {shownCredits.length === 0 ? (
          <EmptyState
            title={loading ? 'Loading credit notes…' : 'No credit notes yet'}
            description="Credit notes from suppliers appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Credit Note</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Applied To</th>
                  <th className="px-3 py-2">Covers</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownCredits.map((credit) => (
                  <tr key={credit.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{credit.creditNoteNumber}</p>
                      <p className="text-xs text-slate-500">
                        {showDate(credit.issuedAt)} · {credit.recordedByName}
                      </p>
                    </td>
                    <td className="px-3 py-2">{credit.supplierName}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {currency.format(credit.amount)}
                    </td>
                    <td className="px-3 py-2">
                      {credit.orderNumber ? (
                        <>
                          {credit.orderNumber}
                          {credit.appliedAt && (
                            <span className="block text-xs text-slate-500">
                              {showDate(credit.appliedAt)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                          Kept for next order
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {credit.returnCount
                        ? `${credit.returnCount} return${credit.returnCount === 1 ? '' : 's'}`
                        : 'No linked return'}
                      {credit.notes && (
                        <span className="block text-xs text-slate-500">{credit.notes}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!credit.purchaseOrderId && (
                        <button
                          type="button"
                          className="secondary-button text-xs"
                          onClick={() => setDialog(credit)}
                        >
                          Apply to Order
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="returns-title">
        <h3 id="returns-title" className="section-title mb-2">
          Stock Returned to Suppliers
        </h3>
        {shownReturns.length === 0 ? (
          <EmptyState
            title={loading ? 'Loading returns…' : 'No returns yet'}
            description="Stock sent back to a supplier appears here."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Product and Batch</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2 text-right">Pieces</th>
                  <th className="px-3 py-2 text-right">Cost Value</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Credit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownReturns.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{showDate(item.returnedAt)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-slate-500">Batch {item.batchNumber}</p>
                    </td>
                    <td className="px-3 py-2">{item.supplierName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {currency.format(item.costValue)}
                    </td>
                    <td className="px-3 py-2">
                      {supplierReturnReasons[item.reasonCode]}
                      {item.notes && (
                        <span className="block text-xs text-slate-500">{item.notes}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.creditNoteNumber ?? (
                        <span className="text-xs font-semibold text-amber-700">Waiting</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialog === 'return' && (
        <ReturnDialog
          procurement={procurement}
          close={() => setDialog(null)}
          saved={(message) => done(message)}
        />
      )}
      {dialog === 'credit' && (
        <CreditNoteDialog
          procurement={procurement}
          returns={returns}
          close={() => setDialog(null)}
          saved={(message) => done(message)}
        />
      )}
      {dialog && typeof dialog === 'object' && (
        <ApplyCreditDialog
          credit={dialog}
          procurement={procurement}
          close={() => setDialog(null)}
          saved={(message) => done(message)}
        />
      )}
    </div>
  )
}

/** Orders from one supplier that still owe money, labelled short so the select never clips. */
const owingOrders = (
  procurement: Procurement,
  supplierId: number
): Procurement['paymentSummaries'] =>
  procurement.paymentSummaries.filter(
    (summary) => summary.supplierId === supplierId && summary.outstandingAmount > 0.009
  )

function ReturnDialog({
  procurement,
  close,
  saved
}: {
  procurement: Procurement
  close: VoidFunction
  saved: (message: string) => Promise<void>
}): ReactElement {
  const [drugId, setDrugId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reasonCode, setReasonCode] = useState<SupplierReturnReason | ''>('')
  const [notes, setNotes] = useState('')
  const [returnedAt, setReturnedAt] = useState(localDate())
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const stocked = useMemo(
    () =>
      procurement.products
        .filter((product) => product.batches.some((batch) => batch.stock > 0))
        .sort((a, b) => a.brandName.localeCompare(b.brandName)),
    [procurement.products]
  )
  const product = stocked.find((item) => String(item.id) === drugId)
  const batches = (product?.batches ?? [])
    .filter((batch) => batch.stock > 0)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  const batch = batches.find((item) => String(item.id) === batchId)
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    const found: FieldErrors = {}
    if (!batch) found.batchId = 'Choose the product and the batch sent back.'
    const pieces = Number(quantity)
    if (!Number.isInteger(pieces) || pieces < 1) found.quantity = 'Enter the pieces returned.'
    else if (batch && pieces > batch.stock)
      found.quantity = `Only ${batch.stock} pieces of this batch are in stock.`
    if (!reasonCode) found.reasonCode = 'Choose why the stock is returned.'
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }
    setSaving(true)
    setError('')
    try {
      await recordSupplierReturn({
        batchId: Number(batchId),
        quantity: pieces,
        reasonCode: reasonCode as SupplierReturnReason,
        notes: notes.trim(),
        returnedAt
      })
      await saved(
        `${pieces} piece(s) of ${product?.brandName} batch ${batch?.batchNumber} returned to ${batch?.supplier}. Record the credit note when the supplier sends it.`
      )
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to record the return.')
      setErrors(result.fields)
      setError(result.form)
      setSaving(false)
    }
  }
  return (
    <Modal
      title="Return Stock to Supplier"
      description="The pieces leave inventory from the batch you choose. The batch's supplier is the one the stock goes back to."
      close={close}
      busy={saving}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        <RequiredNote />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Product" required>
            <select
              className="field"
              value={drugId}
              onChange={(event) => {
                setDrugId(event.target.value)
                setBatchId('')
                setErrors({})
              }}
            >
              <option value="">Select product</option>
              {stocked.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.brandName} · {item.genericName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Batch"
            required
            error={errors.batchId}
            hint="Soonest expiry first. Only batches in stock are listed."
          >
            <select
              className="field"
              value={batchId}
              disabled={!product}
              onChange={(event) => {
                setBatchId(event.target.value)
                setErrors((current) => ({ ...current, batchId: '' }))
              }}
            >
              <option value="">{product ? 'Select batch' : 'Choose a product first'}</option>
              {batches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.batchNumber} · exp {item.expiresAt.slice(0, 10)} · {item.stock} pcs
                </option>
              ))}
            </select>
          </FormField>
          {batch && (
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700 sm:col-span-2">
              Supplier: <strong>{batch.supplier}</strong> · {batch.stock} pieces in stock · boxes of{' '}
              {batch.piecesPerBox}
            </p>
          )}
          <FormField label="Pieces Returned" required error={errors.quantity}>
            <input
              className="field"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value)
                setErrors((current) => ({ ...current, quantity: '' }))
              }}
            />
          </FormField>
          <FormField label="Return Date" required error={errors.returnedAt}>
            <input
              className="field"
              type="date"
              max={localDate()}
              value={returnedAt}
              onChange={(event) => setReturnedAt(event.target.value)}
            />
          </FormField>
          <FormField label="Reason" required error={errors.reasonCode}>
            <select
              className="field"
              value={reasonCode}
              onChange={(event) => {
                setReasonCode(event.target.value as SupplierReturnReason)
                setErrors((current) => ({ ...current, reasonCode: '' }))
              }}
            >
              <option value="">Select reason</option>
              {(Object.keys(supplierReturnReasons) as SupplierReturnReason[]).map((code) => (
                <option key={code} value={code}>
                  {supplierReturnReasons[code]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Notes"
            required={reasonCode === 'other'}
            error={errors.notes}
            hint="e.g. supplier's return slip number."
          >
            <input
              className="field"
              maxLength={300}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </FormField>
        </div>
        <FormError message={error} />
        <Actions close={close} saving={saving} label="Record Return" />
      </form>
    </Modal>
  )
}

function CreditNoteDialog({
  procurement,
  returns,
  close,
  saved
}: {
  procurement: Procurement
  returns: SupplierReturnRecord[]
  close: VoidFunction
  saved: (message: string) => Promise<void>
}): ReactElement {
  const [supplierId, setSupplierId] = useState(0)
  const [number, setNumber] = useState('')
  const [issuedAt, setIssuedAt] = useState(localDate())
  const [amount, setAmount] = useState('')
  const [orderId, setOrderId] = useState('')
  const [returnIds, setReturnIds] = useState<number[]>([])
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const open = returns.filter((item) => item.supplierId === supplierId && !item.creditNoteId)
  const orders = owingOrders(procurement, supplierId)
  const linkedValue = open
    .filter((item) => returnIds.includes(item.id))
    .reduce((sum, item) => sum + item.costValue, 0)
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setErrors({})
    try {
      await recordCreditNote({
        supplierId,
        creditNoteNumber: number.trim(),
        issuedAt,
        amount: amount.trim() === '' ? Number.NaN : Number(amount),
        purchaseOrderId: orderId ? Number(orderId) : null,
        returnIds,
        notes: notes.trim()
      })
      await saved(
        orderId
          ? `Credit note ${number.trim()} recorded and applied to ${orders.find((order) => String(order.purchaseOrderId) === orderId)?.orderNumber}.`
          : `Credit note ${number.trim()} recorded and kept for the next order.`
      )
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to record the credit note.')
      setErrors(result.fields)
      setError(result.form)
      setSaving(false)
    }
  }
  return (
    <Modal
      title="Record Supplier Credit Note"
      description="Enter the credit note exactly as the supplier issued it."
      close={close}
      size="md"
      busy={saving}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        <RequiredNote />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Supplier" required error={errors.supplierId}>
            <select
              className="field"
              value={supplierId}
              onChange={(event) => {
                setSupplierId(Number(event.target.value))
                setOrderId('')
                setReturnIds([])
              }}
            >
              <option value={0}>Select supplier</option>
              {procurement.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.organization}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Credit Note No." required error={errors.creditNoteNumber}>
            <input
              className="field"
              maxLength={80}
              placeholder="e.g. CN-0042"
              value={number}
              onChange={(event) => setNumber(filterInput('reference', event.target.value).value)}
            />
          </FormField>
          <FormField label="Credit Note Date" required error={errors.issuedAt}>
            <input
              className="field"
              type="date"
              max={localDate()}
              value={issuedAt}
              onChange={(event) => setIssuedAt(event.target.value)}
            />
          </FormField>
          <FormField label="Amount (₱)" required error={errors.amount}>
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FormField>
          <FormField
            label="Apply to Purchase Order"
            error={errors.purchaseOrderId}
            hint="Orders from this supplier that still owe money. Leave empty to keep the credit for the next order."
            className="sm:col-span-2"
          >
            <select
              className="field truncate pr-8"
              value={orderId}
              disabled={!supplierId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Keep for next order</option>
              {orders.map((order) => (
                <option key={order.purchaseOrderId} value={order.purchaseOrderId}>
                  {order.orderNumber} · owes {currency.format(order.outstandingAmount)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {supplierId > 0 && (
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">Returns This Credit Covers</legend>
            {open.length === 0 ? (
              <p className="text-sm text-slate-500">
                No returns to this supplier are waiting for a credit note.
              </p>
            ) : (
              <ul className="space-y-1">
                {open.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={returnIds.includes(item.id)}
                        onChange={(event) =>
                          setReturnIds((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((value) => value !== item.id)
                          )
                        }
                      />
                      <span>
                        {showDate(item.returnedAt)} · {item.productName} batch {item.batchNumber} ·{' '}
                        {item.quantity} pcs · {currency.format(item.costValue)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {returnIds.length > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                Cost value of the selected returns: {currency.format(linkedValue)}. The credit note
                amount is what the supplier issued and may differ.
              </p>
            )}
          </fieldset>
        )}
        <FormField label="Notes" error={errors.notes}>
          <input
            className="field"
            maxLength={300}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
        <FormError message={error} />
        <Actions close={close} saving={saving} label="Record Credit Note" />
      </form>
    </Modal>
  )
}

function ApplyCreditDialog({
  credit,
  procurement,
  close,
  saved
}: {
  credit: CreditNoteRecord
  procurement: Procurement
  close: VoidFunction
  saved: (message: string) => Promise<void>
}): ReactElement {
  const orders = owingOrders(procurement, credit.supplierId)
  const [orderId, setOrderId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    if (!orderId) {
      setError('Choose the purchase order.')
      return
    }
    setSaving(true)
    try {
      await applyCreditNote(credit.id, Number(orderId))
      await saved(
        `Credit note ${credit.creditNoteNumber} applied to ${orders.find((order) => String(order.purchaseOrderId) === orderId)?.orderNumber}.`
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply the credit note.')
      setSaving(false)
    }
  }
  return (
    <Modal
      title={`Apply ${credit.creditNoteNumber}`}
      description={`${credit.supplierName} · ${currency.format(credit.amount)}. The credit lowers the balance owed on the order you choose.`}
      close={close}
      size="sm"
      busy={saving}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-600">
            No order from {credit.supplierName} owes money right now. The credit stays kept until
            the next order.
          </p>
        ) : (
          <FormField label="Purchase Order" required>
            <select
              className="field truncate pr-8"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Select order</option>
              {orders.map((order) => (
                <option key={order.purchaseOrderId} value={order.purchaseOrderId}>
                  {order.orderNumber} · owes {currency.format(order.outstandingAmount)}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormError message={error} />
        <Actions close={close} saving={saving} label="Apply Credit" disabled={!orders.length} />
      </form>
    </Modal>
  )
}

function Actions({
  close,
  saving,
  label,
  disabled = false
}: {
  close: VoidFunction
  saving: boolean
  label: string
  disabled?: boolean
}): ReactElement {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button type="button" className="secondary-button" onClick={close} disabled={saving}>
        Cancel
      </button>
      <button type="submit" className="primary-button" disabled={saving || disabled}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}
