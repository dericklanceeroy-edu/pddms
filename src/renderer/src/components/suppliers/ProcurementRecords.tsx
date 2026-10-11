import { splitErrors, type FieldErrors } from '@renderer/components/ui/fieldErrors'
import FormField, { FormError, RequiredNote } from '@renderer/components/ui/FormField'
import Modal from '@renderer/components/ui/Modal'
import type {
  InvoiceRecord,
  InvoiceUploadValues,
  PaymentRecord,
  PaymentSummary,
  PurchaseOrderRecord,
  SelectedInvoiceFile,
  SupplierPaymentValues
} from '@renderer/data/supplierOrders'
import { deadlineLabels, deadlineTone, orderStatusLabels } from '@renderer/data/supplierOrders'
import type { SupplierOrdersState } from '@renderer/hooks/useSupplierOrders'
import { localDate } from '@shared/inventory'
import { useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import {
  FiAlertCircle,
  FiClock,
  FiCreditCard,
  FiDownload,
  FiExternalLink,
  FiFilePlus,
  FiFileText,
  FiPaperclip,
  FiTruck
} from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

const today = (): string => localDate()
const toNumber = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value))

export default function ProcurementRecords({
  view,
  query,
  procurement,
  feedback
}: {
  view: 'receiving' | 'invoices' | 'history'
  query: string
  procurement: SupplierOrdersState
  feedback: (message: string, tone?: 'success' | 'error') => void
}): ReactElement {
  const [invoiceDialog, setInvoiceDialog] = useState(false)
  const [paymentDialog, setPaymentDialog] = useState<{
    summary?: PaymentSummary
    invoice?: InvoiceRecord
  } | null>(null)
  const normalized = query.trim().toLowerCase()
  const invoices = procurement.invoices.filter((invoice) =>
    `${invoice.invoiceNumber} ${invoice.orderNumber} ${invoice.supplierName} ${invoice.status}`
      .toLowerCase()
      .includes(normalized)
  )

  if (view === 'history') {
    return <TransactionHistory procurement={procurement} query={normalized} />
  }
  if (view === 'receiving') {
    return <ReceivingReports procurement={procurement} query={normalized} />
  }

  const overdue = procurement.invoices.filter((invoice) => invoice.deadlineStatus === 'overdue')
  const dueSoon = procurement.invoices.filter((invoice) => invoice.deadlineStatus === 'due_soon')

  return (
    <div>
      <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <InvoiceMetric
          label="Overdue"
          value={overdue.length}
          tone="text-rose-700"
          icon={<FiAlertCircle />}
        />
        <InvoiceMetric
          label="Due in 7 days"
          value={dueSoon.length}
          tone="text-amber-700"
          icon={<FiClock />}
        />
        <button
          type="button"
          className="secondary-button justify-center"
          onClick={() => setPaymentDialog({})}
          disabled={!procurement.paymentSummaries.some((summary) => summary.outstandingAmount > 0)}
        >
          <FiCreditCard /> Record payment
        </button>
        <button
          type="button"
          className="primary-button justify-center"
          onClick={() => setInvoiceDialog(true)}
        >
          <FiFilePlus /> Add supplier invoice
        </button>
      </div>
      <section className="border-b border-slate-200 p-4">
        <div className="mb-3">
          <h3 className="font-semibold text-slate-900">Balances owed to suppliers</h3>
          <p className="text-xs text-slate-500">
            Based on the products actually received for each purchase order. You can record a
            payment before the supplier invoice is added.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {procurement.paymentSummaries.map((summary) => (
            <article
              key={summary.purchaseOrderId}
              className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold" title={summary.supplierName}>
                    {summary.supplierName}
                  </p>
                  <p className="text-xs text-slate-500">{summary.orderNumber}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    summary.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-700'
                      : summary.status === 'partially_paid'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {summary.status === 'paid'
                    ? 'Paid'
                    : summary.status === 'partially_paid'
                      ? 'Partially paid'
                      : 'Unpaid'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Owed</dt>
                  <dd className="mt-1 truncate font-semibold">
                    {currency.format(summary.totalAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Paid</dt>
                  <dd className="mt-1 truncate font-semibold">
                    {currency.format(summary.paidAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Remaining</dt>
                  <dd className="mt-1 truncate font-semibold">
                    {currency.format(summary.outstandingAmount)}
                  </dd>
                </div>
              </dl>
              {summary.outstandingAmount > 0 && (
                <button
                  type="button"
                  className="secondary-button mt-3 w-full justify-center text-xs"
                  onClick={() => setPaymentDialog({ summary })}
                >
                  <FiCreditCard /> Record payment
                </button>
              )}
            </article>
          ))}
          {!procurement.isLoading && procurement.paymentSummaries.length === 0 && (
            <p className="text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
              No balances yet. A balance appears here after products are received for a purchase
              order.
            </p>
          )}
        </div>
      </section>
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">Supplier invoices</h3>
        <p className="text-xs text-slate-500">
          Invoice documents attached to purchase orders, with their due dates and amounts paid.
        </p>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[850px] table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[18%]" />
            <col className="w-[25%]" />
            <col className="hidden w-[17%] xl:table-column" />
            <col className="w-24" />
          </colgroup>
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-3">Invoice</th>
              <th className="px-3 py-3">Supplier / order</th>
              <th className="px-3 py-3">Due date</th>
              <th className="px-3 py-3">Payment</th>
              <th className="hidden px-3 py-3 xl:table-cell">File</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="min-w-0 px-3 py-4">
                  <p
                    className="truncate font-semibold text-slate-900"
                    title={invoice.invoiceNumber}
                  >
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    Issued {date.format(new Date(invoice.invoiceDate))}
                  </p>
                  <p
                    className="mt-1 truncate text-xs text-slate-500 xl:hidden"
                    title={invoice.originalFilename}
                  >
                    {invoice.originalFilename}
                  </p>
                </td>
                <td className="min-w-0 px-3 py-4">
                  <p className="truncate" title={invoice.supplierName}>
                    {invoice.supplierName}
                  </p>
                  <p className="truncate text-xs text-slate-500" title={invoice.orderNumber}>
                    {invoice.orderNumber}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <p>{date.format(new Date(invoice.dueDate))}</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${deadlineTone[invoice.deadlineStatus]}`}
                  >
                    {deadlineLabels[invoice.deadlineStatus]}
                  </span>
                </td>
                <td className="min-w-0 px-3 py-4">
                  <p className="font-semibold break-words tabular-nums">
                    {currency.format(invoice.outstandingAmount)} due
                  </p>
                  <p className="text-xs text-slate-500">
                    {currency.format(invoice.paidAmount)} of {currency.format(invoice.amount)} paid
                  </p>
                </td>
                <td className="hidden min-w-0 px-3 py-4 xl:table-cell">
                  <p className="truncate" title={invoice.originalFilename}>
                    {invoice.originalFilename}
                  </p>
                  <p className="text-xs text-slate-500">{Math.ceil(invoice.fileSize / 1024)} KB</p>
                </td>
                <td className="px-3 py-4 align-top">
                  <div className="flex flex-col items-stretch gap-2">
                    <button
                      type="button"
                      className="secondary-button justify-center px-2 text-xs"
                      onClick={() =>
                        void procurement
                          .openInvoice(invoice.id)
                          .catch((cause: unknown) =>
                            feedback(
                              cause instanceof Error ? cause.message : 'Unable to open invoice.',
                              'error'
                            )
                          )
                      }
                    >
                      <FiExternalLink /> View
                    </button>
                    <button
                      type="button"
                      className="secondary-button justify-center px-2 text-xs"
                      onClick={() =>
                        void procurement
                          .downloadInvoice(invoice.id)
                          .then((saved) => {
                            if (saved) feedback(`Invoice ${invoice.invoiceNumber} saved.`)
                          })
                          .catch((cause: unknown) =>
                            feedback(
                              cause instanceof Error
                                ? cause.message
                                : 'Unable to download the invoice.',
                              'error'
                            )
                          )
                      }
                    >
                      <FiDownload /> Download
                    </button>
                    {procurement.paymentSummaries.some(
                      (summary) =>
                        summary.purchaseOrderId === invoice.purchaseOrderId &&
                        summary.outstandingAmount > 0
                    ) && (
                      <button
                        type="button"
                        className="secondary-button justify-center px-2 text-xs"
                        onClick={() =>
                          setPaymentDialog({
                            invoice,
                            summary: procurement.paymentSummaries.find(
                              (summary) => summary.purchaseOrderId === invoice.purchaseOrderId
                            )
                          })
                        }
                      >
                        <FiCreditCard /> Record payment
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!procurement.isLoading && invoices.length === 0 && (
          <p className="p-10 text-center text-sm text-slate-500">
            {procurement.invoices.length === 0
              ? 'No supplier invoices yet. Use Add supplier invoice once the supplier sends one.'
              : 'No invoices match this search.'}
          </p>
        )}
      </div>
      {invoiceDialog && (
        <InvoiceDialog
          orders={procurement.orders}
          chooseFile={procurement.chooseInvoiceFile}
          close={() => setInvoiceDialog(false)}
          save={async (values) => {
            const uploaded = await procurement.uploadInvoice(values)
            setInvoiceDialog(false)
            feedback(`Supplier invoice ${uploaded.invoiceNumber} saved.`)
          }}
        />
      )}
      {paymentDialog && (
        <PaymentDialog
          summaries={procurement.paymentSummaries}
          invoices={procurement.invoices}
          initialSummary={paymentDialog.summary}
          initialInvoice={paymentDialog.invoice}
          close={() => setPaymentDialog(null)}
          save={async (values) => {
            await procurement.recordPayment(values)
            setPaymentDialog(null)
            feedback('Supplier payment recorded.')
          }}
        />
      )}
    </div>
  )
}

function ReceivingReports({
  procurement,
  query
}: {
  procurement: SupplierOrdersState
  query: string
}): ReactElement {
  const deliveries = procurement.deliveries.filter((delivery) =>
    `${delivery.orderNumber} ${delivery.supplierName} ${delivery.recordedByName} ${delivery.items
      .map((item) => `${item.productName} ${item.batchNumber} ${item.expiresAt}`)
      .join(' ')}`
      .toLowerCase()
      .includes(query)
  )

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div>
        <h3 className="font-semibold text-slate-900">Receiving reports</h3>
        <p className="text-sm text-slate-500">
          Each report is one recorded delivery and the inventory batches it added stock to.
        </p>
      </div>
      {deliveries.map((delivery) => {
        const order = procurement.orders.find((record) => record.id === delivery.purchaseOrderId)
        return (
          <article
            key={delivery.id}
            className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  Receiving report #{delivery.id} · {delivery.orderNumber}
                </p>
                <p className="truncate text-sm text-slate-500">{delivery.supplierName}</p>
              </div>
              <div className="shrink-0 text-sm sm:text-right">
                <p>{date.format(new Date(delivery.deliveredAt))}</p>
                <p className="text-xs text-slate-500">
                  Recorded by {delivery.recordedByName}
                  {order ? ` · ${orderStatusLabels[order.status]}` : ''}
                </p>
              </div>
            </header>
            <div className="divide-y divide-slate-100">
              {delivery.items.map((item) => {
                const expired = item.expiresAt < today()
                return (
                  <div
                    key={item.id}
                    className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900" title={item.productName}>
                        {item.productName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.orderedQuantity} ordered ·{' '}
                        <span className="font-semibold text-slate-700">
                          {item.quantity} received
                        </span>{' '}
                        in this delivery
                      </p>
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="text-xs text-slate-500">Inventory batch</p>
                      <p className="truncate font-medium" title={item.batchNumber}>
                        {item.batchNumber}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-xs text-slate-500">Expiry</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{date.format(new Date(item.expiresAt))}</p>
                        {expired && (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            Expired
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {delivery.notes && (
              <p className="border-t border-slate-100 px-4 py-3 text-sm break-words text-slate-600">
                {delivery.notes}
              </p>
            )}
          </article>
        )
      })}
      {!procurement.isLoading && deliveries.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">
          {procurement.deliveries.length === 0
            ? 'No deliveries recorded yet. Receive products against a submitted purchase order above.'
            : 'No receiving reports match this search.'}
        </p>
      )}
    </div>
  )
}

function TransactionHistory({
  procurement,
  query
}: {
  procurement: SupplierOrdersState
  query: string
}): ReactElement {
  const transactions = useMemo(() => {
    const rows = [
      ...procurement.orders.map((order) => ({
        id: `order-${order.id}`,
        occurredAt: order.orderedAt,
        type: 'Purchase order',
        reference: order.orderNumber,
        supplier: order.supplierName,
        details: `${order.items.reduce((total, item) => total + item.quantity, 0)} units · ${orderStatusLabels[order.status]}`,
        amount: order.totalAmount,
        icon: <FiFileText />
      })),
      ...procurement.deliveries.map((delivery) => ({
        id: `delivery-${delivery.id}`,
        occurredAt: delivery.deliveredAt,
        type: 'Delivery',
        reference: delivery.orderNumber,
        supplier: delivery.supplierName,
        details: `${delivery.items.reduce((total, item) => total + item.quantity, 0)} units · ${delivery.items.map((item) => item.batchNumber).join(', ')}`,
        amount: null,
        icon: <FiTruck />
      })),
      ...procurement.invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        occurredAt: invoice.invoiceDate,
        type: 'Invoice',
        reference: invoice.invoiceNumber,
        supplier: invoice.supplierName,
        details: `${invoice.orderNumber} · ${deadlineLabels[invoice.deadlineStatus]}`,
        amount: invoice.amount,
        icon: <FiFilePlus />
      })),
      ...procurement.payments.map((payment: PaymentRecord) => ({
        id: `payment-${payment.id}`,
        occurredAt: payment.paidAt,
        type: 'Payment',
        reference: payment.referenceNumber || `Payment #${payment.id}`,
        supplier: payment.supplierName,
        details: `${payment.invoiceNumber ?? payment.orderNumber} · ${payment.method}`,
        amount: payment.amount,
        icon: <FiCreditCard />
      }))
    ]
    return rows
      .filter((row) =>
        `${row.type} ${row.reference} ${row.supplier} ${row.details}`.toLowerCase().includes(query)
      )
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  }, [
    procurement.deliveries,
    procurement.invoices,
    procurement.orders,
    procurement.payments,
    query
  ])

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-5 py-3">Transaction</th>
            <th className="px-5 py-3">Reference</th>
            <th className="px-5 py-3">Supplier</th>
            <th className="px-5 py-3">Details</th>
            <th className="px-5 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td className="px-5 py-4">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                  <span className="text-brand-600">{transaction.icon}</span>
                  {transaction.type}
                </span>
                <p className="mt-1 text-xs text-slate-500">
                  {date.format(new Date(transaction.occurredAt))}
                </p>
              </td>
              <td className="px-5 py-4 font-medium">{transaction.reference}</td>
              <td className="px-5 py-4">{transaction.supplier}</td>
              <td className="px-5 py-4 text-slate-600">{transaction.details}</td>
              <td className="px-5 py-4 text-right font-semibold">
                {transaction.amount === null ? '—' : currency.format(transaction.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!procurement.isLoading && transactions.length === 0 && (
        <p className="p-10 text-center text-sm text-slate-500">
          No supplier transactions match this search.
        </p>
      )}
    </div>
  )
}

function InvoiceDialog({
  orders,
  chooseFile,
  close,
  save
}: {
  orders: PurchaseOrderRecord[]
  chooseFile: () => Promise<SelectedInvoiceFile | null>
  close: VoidFunction
  save: (values: InvoiceUploadValues) => Promise<void>
}): ReactElement {
  const eligibleOrders = orders.filter(
    (order) =>
      ['submitted', 'partially_received', 'received'].includes(order.status) ||
      (order.status === 'cancelled' && order.items.some((item) => item.receivedQuantity > 0))
  )
  const [purchaseOrderId, setPurchaseOrderId] = useState(eligibleOrders[0]?.id ?? 0)
  const selectedOrder = eligibleOrders.find((order) => order.id === purchaseOrderId)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState(String(selectedOrder?.totalAmount ?? ''))
  const [file, setFile] = useState<SelectedInvoiceFile | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const clear = (key: string): void => setErrors((current) => ({ ...current, [key]: '' }))

  const pickFile = async (): Promise<void> => {
    setChoosing(true)
    setError('')
    try {
      const selected = await chooseFile()
      if (selected) {
        setFile(selected)
        clear('fileToken')
      }
    } catch (cause) {
      setErrors((current) => ({
        ...current,
        fileToken: cause instanceof Error ? cause.message : 'Unable to select the file.'
      }))
    } finally {
      setChoosing(false)
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setErrors({})
    try {
      await save({
        fileToken: file?.token ?? '',
        purchaseOrderId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        amount: toNumber(amount)
      })
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to save the invoice.')
      if (!file && !result.fields.fileToken)
        result.fields.fileToken = 'Invoice file is required. Choose the invoice document to attach.'
      setErrors(result.fields)
      setError(result.form)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Add supplier invoice"
      description="Record the supplier's invoice and attach the document they provided."
      close={close}
      busy={saving || choosing}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        <RequiredNote />
        {eligibleOrders.length === 0 && (
          <FormError message="Submit a purchase order before attaching a supplier invoice." />
        )}
        <FormField label="Purchase order" required error={errors.purchaseOrderId}>
          <select
            className="field"
            value={purchaseOrderId}
            onChange={(event) => {
              const id = Number(event.target.value)
              setPurchaseOrderId(id)
              clear('purchaseOrderId')
              setAmount(String(eligibleOrders.find((order) => order.id === id)?.totalAmount ?? ''))
            }}
          >
            <option value={0}>Select purchase order</option>
            {eligibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} · {order.supplierName} · {orderStatusLabels[order.status]}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Invoice number" required error={errors.invoiceNumber}>
            <input
              className="field"
              maxLength={80}
              placeholder="e.g. SI-2026-0042"
              value={invoiceNumber}
              onChange={(event) => {
                setInvoiceNumber(event.target.value)
                clear('invoiceNumber')
              }}
            />
          </FormField>
          <FormField
            label="Invoice amount (₱)"
            required
            hint={selectedOrder ? `Order total ${currency.format(selectedOrder.totalAmount)}` : ''}
            error={errors.amount}
          >
            <input
              min="0.01"
              step="0.01"
              type="number"
              inputMode="decimal"
              className="field"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                clear('amount')
              }}
            />
          </FormField>
          <FormField label="Invoice date" required error={errors.invoiceDate}>
            <input
              type="date"
              max={today()}
              className="field"
              value={invoiceDate}
              onChange={(event) => {
                setInvoiceDate(event.target.value)
                clear('invoiceDate')
              }}
            />
          </FormField>
          <FormField
            label="Payment due date"
            required
            hint="On or after the invoice date."
            error={errors.dueDate}
          >
            <input
              min={invoiceDate}
              type="date"
              className="field"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value)
                clear('dueDate')
              }}
            />
          </FormField>
        </div>
        <FormField
          label="Invoice document"
          required
          hint="PDF, PNG, JPEG or WebP. A copy is stored with the record."
          error={errors.fileToken}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button
              type="button"
              className="secondary-button"
              disabled={choosing || saving}
              onClick={() => void pickFile()}
            >
              <FiPaperclip /> {choosing ? 'Choosing…' : file ? 'Change file' : 'Choose file'}
            </button>
            <span className="min-w-0 truncate text-sm text-slate-600">
              {file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : 'No file chosen'}
            </span>
          </div>
        </FormField>
        <FormError message={error} />
        <Actions
          close={close}
          saving={saving}
          label="Save supplier invoice"
          disabled={eligibleOrders.length === 0 || choosing}
        />
      </form>
    </Modal>
  )
}

function PaymentDialog({
  summaries,
  invoices,
  initialSummary,
  initialInvoice,
  close,
  save
}: {
  summaries: PaymentSummary[]
  invoices: InvoiceRecord[]
  initialSummary?: PaymentSummary
  initialInvoice?: InvoiceRecord
  close: VoidFunction
  save: (values: SupplierPaymentValues) => Promise<void>
}): ReactElement {
  const payableSummaries = summaries.filter((summary) => summary.outstandingAmount > 0)
  const supplierIds = [...new Set(payableSummaries.map((summary) => summary.supplierId))]
  const [supplierId, setSupplierId] = useState(
    initialSummary?.supplierId ?? payableSummaries[0]?.supplierId ?? 0
  )
  const supplierSummaries = payableSummaries.filter((summary) => summary.supplierId === supplierId)
  const [purchaseOrderId, setPurchaseOrderId] = useState(
    initialSummary?.purchaseOrderId ?? supplierSummaries[0]?.purchaseOrderId ?? 0
  )
  const selectedSummary = payableSummaries.find(
    (summary) => summary.purchaseOrderId === purchaseOrderId
  )
  const matchingInvoices = invoices.filter((invoice) => invoice.purchaseOrderId === purchaseOrderId)
  const [invoiceId, setInvoiceId] = useState<number | null>(initialInvoice?.id ?? null)
  const selectedInvoice = matchingInvoices.find((invoice) => invoice.id === invoiceId)
  const [amount, setAmount] = useState(
    String(
      initialInvoice
        ? Math.min(initialInvoice.outstandingAmount, initialSummary?.outstandingAmount ?? Infinity)
        : (initialSummary?.outstandingAmount ?? supplierSummaries[0]?.outstandingAmount ?? '')
    )
  )
  const [paidAt, setPaidAt] = useState(today())
  const [method, setMethod] = useState('Bank transfer')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const clear = (key: string): void => setErrors((current) => ({ ...current, [key]: '' }))
  const maximum = Math.min(
    selectedSummary?.outstandingAmount ?? 0,
    selectedInvoice?.outstandingAmount ?? Infinity
  )

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    setErrors({})
    const value = toNumber(amount)
    if (Number.isFinite(value) && value > maximum) {
      setErrors({
        amount: `Payment cannot exceed the ${selectedInvoice ? 'invoice' : 'delivered order'} balance of ${currency.format(maximum)}.`
      })
      return
    }
    submitting.current = true
    setSaving(true)
    try {
      await save({
        purchaseOrderId,
        invoiceId,
        amount: value,
        paidAt,
        method,
        referenceNumber: referenceNumber.trim() || null,
        notes: notes.trim() || null
      })
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to record the payment.')
      setErrors(result.fields)
      setError(result.form)
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Record supplier payment"
      description="Payments are recorded against the value of stock already delivered. Linking an invoice is optional."
      close={close}
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
                const nextSupplierId = Number(event.target.value)
                const nextSummary = payableSummaries.find(
                  (summary) => summary.supplierId === nextSupplierId
                )
                setSupplierId(nextSupplierId)
                setPurchaseOrderId(nextSummary?.purchaseOrderId ?? 0)
                setInvoiceId(null)
                setAmount(String(nextSummary?.outstandingAmount ?? ''))
              }}
            >
              <option value={0}>Select supplier</option>
              {supplierIds.map((id) => (
                <option key={id} value={id}>
                  {payableSummaries.find((summary) => summary.supplierId === id)?.supplierName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Purchase order" required error={errors.purchaseOrderId}>
            <select
              className="field"
              value={purchaseOrderId}
              onChange={(event) => {
                const id = Number(event.target.value)
                const nextSummary = payableSummaries.find(
                  (summary) => summary.purchaseOrderId === id
                )
                setPurchaseOrderId(id)
                setInvoiceId(null)
                clear('purchaseOrderId')
                setAmount(String(nextSummary?.outstandingAmount ?? ''))
              }}
            >
              <option value={0}>Select purchase order</option>
              {supplierSummaries.map((summary) => (
                <option key={summary.purchaseOrderId} value={summary.purchaseOrderId}>
                  {summary.orderNumber} · {currency.format(summary.outstandingAmount)} remaining
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Supplier invoice"
            hint="Link the invoice this payment settles, if any."
            error={errors.invoiceId}
          >
            <select
              className="field"
              value={invoiceId ?? ''}
              onChange={(event) => {
                const id = event.target.value ? Number(event.target.value) : null
                setInvoiceId(id)
                const invoice = matchingInvoices.find((item) => item.id === id)
                if (invoice)
                  setAmount(
                    String(
                      Math.min(invoice.outstandingAmount, selectedSummary?.outstandingAmount ?? 0)
                    )
                  )
              }}
            >
              <option value="">Not linked to an invoice</option>
              {matchingInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber} · {currency.format(invoice.outstandingAmount)} due
                </option>
              ))}
            </select>
          </FormField>
          <div className="rounded-md border border-slate-200 p-3 text-sm">
            <p className="text-slate-500">Delivered amount owed</p>
            <p className="font-semibold">{currency.format(selectedSummary?.totalAmount ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">
              Paid {currency.format(selectedSummary?.paidAmount ?? 0)} · Remaining{' '}
              {currency.format(selectedSummary?.outstandingAmount ?? 0)}
            </p>
          </div>
          <FormField
            label="Payment amount (₱)"
            required
            hint={purchaseOrderId ? `Up to ${currency.format(maximum)}` : undefined}
            error={errors.amount}
          >
            <input
              min="0.01"
              step="0.01"
              type="number"
              inputMode="decimal"
              className="field"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                clear('amount')
              }}
            />
          </FormField>
          <FormField label="Payment date" required error={errors.paidAt}>
            <input
              type="date"
              max={today()}
              className="field"
              value={paidAt}
              onChange={(event) => {
                setPaidAt(event.target.value)
                clear('paidAt')
              }}
            />
          </FormField>
          <FormField label="Payment method" required error={errors.method}>
            <select
              className="field"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option>Bank transfer</option>
              <option>Cash</option>
              <option>Check</option>
              <option>E-wallet</option>
              <option>Other</option>
            </select>
          </FormField>
          <FormField
            label="Reference number"
            hint="Check, transfer or receipt number. Each reference can be used once."
            error={errors.referenceNumber}
          >
            <input
              className="field"
              maxLength={120}
              placeholder="e.g. BT-0098123"
              value={referenceNumber}
              onChange={(event) => {
                setReferenceNumber(event.target.value)
                clear('referenceNumber')
              }}
            />
          </FormField>
        </div>
        <FormField label="Notes" error={errors.notes}>
          <textarea
            className="field min-h-20"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
        <FormError message={error} />
        <Actions close={close} saving={saving} label="Record payment" disabled={!purchaseOrderId} />
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
      <button type="submit" disabled={saving || disabled} className="primary-button">
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}

function InvoiceMetric({
  label,
  value,
  tone,
  icon
}: {
  label: string
  value: number
  tone: string
  icon: ReactElement
}): ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-50 px-4 py-3">
      <span className={tone}>{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  )
}
