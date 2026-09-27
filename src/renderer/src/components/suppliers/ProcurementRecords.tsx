import type {
  InvoiceRecord,
  InvoiceUploadValues,
  PaymentRecord,
  PaymentSummary,
  PurchaseOrderRecord,
  SupplierPaymentValues
} from '@renderer/data/supplierOrders'
import { deadlineLabels, deadlineTone, orderStatusLabels } from '@renderer/data/supplierOrders'
import type { SupplierOrdersState } from '@renderer/hooks/useSupplierOrders'
import { useMemo, useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import {
  FiAlertCircle,
  FiClock,
  FiCreditCard,
  FiExternalLink,
  FiFilePlus,
  FiFileText,
  FiTruck,
  FiX
} from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

const today = (): string => {
  const current = new Date()
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
}

export default function ProcurementRecords({
  view,
  query,
  procurement,
  feedback
}: {
  view: 'receiving' | 'invoices' | 'history'
  query: string
  procurement: SupplierOrdersState
  feedback: (message: string) => void
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
      <div className="grid gap-3 border-b border-neutral-200 p-4 sm:grid-cols-2 xl:grid-cols-4">
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
          <FiFilePlus /> Upload invoice
        </button>
      </div>
      <section className="border-b border-neutral-200 p-4">
        <div className="mb-3">
          <h3 className="font-semibold text-neutral-900">Delivered PO payment balances</h3>
          <p className="text-xs text-neutral-500">
            Balances use delivered quantities and remain available before an invoice is uploaded.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {procurement.paymentSummaries.map((summary) => (
            <article
              key={summary.purchaseOrderId}
              className="min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold" title={summary.supplierName}>
                    {summary.supplierName}
                  </p>
                  <p className="text-xs text-neutral-500">{summary.orderNumber}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    summary.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-700'
                      : summary.status === 'partially_paid'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-neutral-200 text-neutral-700'
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
                  <dt className="text-neutral-500">Owed</dt>
                  <dd className="mt-1 truncate font-semibold">
                    {currency.format(summary.totalAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Paid</dt>
                  <dd className="mt-1 truncate font-semibold">
                    {currency.format(summary.paidAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Remaining</dt>
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
            <p className="text-sm text-neutral-500">
              No delivered purchase orders have a balance yet.
            </p>
          )}
        </div>
      </section>
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="font-semibold text-neutral-900">Supplier-provided invoice documents</h3>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[18%]" />
            <col className="w-[25%]" />
            <col className="hidden w-[17%] xl:table-column" />
            <col className="w-24" />
          </colgroup>
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3">Invoice</th>
              <th className="px-5 py-3">Supplier / order</th>
              <th className="px-5 py-3">Due date</th>
              <th className="px-5 py-3">Payment</th>
              <th className="hidden px-3 py-3 xl:table-cell">File</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="min-w-0 px-3 py-4">
                  <p
                    className="truncate font-semibold text-neutral-900"
                    title={invoice.invoiceNumber}
                  >
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Issued {date.format(new Date(invoice.invoiceDate))}
                  </p>
                  <p
                    className="mt-1 truncate text-xs text-neutral-500 xl:hidden"
                    title={invoice.originalFilename}
                  >
                    {invoice.originalFilename}
                  </p>
                </td>
                <td className="min-w-0 px-3 py-4">
                  <p className="truncate" title={invoice.supplierName}>
                    {invoice.supplierName}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{invoice.orderNumber}</p>
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
                  <p className="truncate font-semibold">
                    {currency.format(invoice.outstandingAmount)} due
                  </p>
                  <p className="text-xs text-neutral-500">
                    {currency.format(invoice.paidAmount)} of {currency.format(invoice.amount)} paid
                  </p>
                </td>
                <td className="hidden min-w-0 px-3 py-4 xl:table-cell">
                  <p className="truncate" title={invoice.originalFilename}>
                    {invoice.originalFilename}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {Math.ceil(invoice.fileSize / 1024)} KB
                  </p>
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
                              cause instanceof Error ? cause.message : 'Unable to open invoice.'
                            )
                          )
                      }
                    >
                      <FiExternalLink /> View
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
                        <FiCreditCard /> Pay
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!procurement.isLoading && invoices.length === 0 && (
          <p className="p-10 text-center text-sm text-neutral-500">
            No invoices match this search.
          </p>
        )}
      </div>
      {invoiceDialog && (
        <InvoiceDialog
          orders={procurement.orders}
          close={() => setInvoiceDialog(false)}
          save={async (values) => {
            const uploaded = await procurement.uploadInvoice(values)
            if (uploaded) {
              setInvoiceDialog(false)
              feedback('Supplier invoice uploaded.')
            }
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
        <h3 className="font-semibold text-neutral-900">Receiving reports</h3>
        <p className="text-sm text-neutral-500">
          Live stock-in records linked to purchase orders and inventory batches.
        </p>
      </div>
      {deliveries.map((delivery) => {
        const order = procurement.orders.find((record) => record.id === delivery.purchaseOrderId)
        return (
          <article
            key={delivery.id}
            className="min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white"
          >
            <header className="flex flex-col gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-neutral-900">
                  Receiving report #{delivery.id} · {delivery.orderNumber}
                </p>
                <p className="truncate text-sm text-neutral-500">{delivery.supplierName}</p>
              </div>
              <div className="shrink-0 text-sm sm:text-right">
                <p>{date.format(new Date(delivery.deliveredAt))}</p>
                <p className="text-xs text-neutral-500">
                  Recorded by {delivery.recordedByName}
                  {order ? ` · ${orderStatusLabels[order.status]}` : ''}
                </p>
              </div>
            </header>
            <div className="divide-y divide-neutral-100">
              {delivery.items.map((item) => {
                const expired = item.expiresAt < today()
                return (
                  <div
                    key={item.id}
                    className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900" title={item.productName}>
                        {item.productName}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {item.orderedQuantity} ordered · {item.quantity} received in this report
                      </p>
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="text-xs text-neutral-500">Inventory batch</p>
                      <p className="truncate font-medium" title={item.batchNumber}>
                        {item.batchNumber}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-xs text-neutral-500">Expiry</p>
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
              <p className="border-t border-neutral-100 px-4 py-3 text-sm break-words text-neutral-600">
                {delivery.notes}
              </p>
            )}
          </article>
        )
      })}
      {!procurement.isLoading && deliveries.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-500">
          No receiving reports match this search.
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
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-5 py-3">Transaction</th>
            <th className="px-5 py-3">Reference</th>
            <th className="px-5 py-3">Supplier</th>
            <th className="px-5 py-3">Details</th>
            <th className="px-5 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td className="px-5 py-4">
                <span className="inline-flex items-center gap-2 font-semibold text-neutral-900">
                  <span className="text-mauve-600">{transaction.icon}</span>
                  {transaction.type}
                </span>
                <p className="mt-1 text-xs text-neutral-500">
                  {date.format(new Date(transaction.occurredAt))}
                </p>
              </td>
              <td className="px-5 py-4 font-medium">{transaction.reference}</td>
              <td className="px-5 py-4">{transaction.supplier}</td>
              <td className="px-5 py-4 text-neutral-600">{transaction.details}</td>
              <td className="px-5 py-4 text-right font-semibold">
                {transaction.amount === null ? '—' : currency.format(transaction.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!procurement.isLoading && transactions.length === 0 && (
        <p className="p-10 text-center text-sm text-neutral-500">
          No supplier transactions match this search.
        </p>
      )}
    </div>
  )
}

function InvoiceDialog({
  orders,
  close,
  save
}: {
  orders: PurchaseOrderRecord[]
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await save({ purchaseOrderId, invoiceNumber, invoiceDate, dueDate, amount: Number(amount) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload the invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Upload supplier invoice" close={close}>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field label="Purchase order">
          <select
            required
            className="field"
            value={purchaseOrderId}
            onChange={(event) => {
              const id = Number(event.target.value)
              setPurchaseOrderId(id)
              setAmount(String(eligibleOrders.find((order) => order.id === id)?.totalAmount ?? ''))
            }}
          >
            <option value={0}>Select purchase order</option>
            {eligibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} · {order.supplierName}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice number">
            <input
              required
              className="field"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
            />
          </Field>
          <Field label="Amount">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              className="field"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Invoice date">
            <input
              required
              type="date"
              max={today()}
              className="field"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
            />
          </Field>
          <Field label="Payment due date">
            <input
              required
              min={invoiceDate}
              type="date"
              className="field"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs leading-5 text-neutral-500">
          Upload the invoice document received from the supplier. After you continue, choose the PDF
          or image file to store securely with this record.
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Actions
          close={close}
          saving={saving}
          label="Choose file & upload"
          disabled={!purchaseOrderId}
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
  const [amount, setAmount] = useState(
    String(initialSummary?.outstandingAmount ?? supplierSummaries[0]?.outstandingAmount ?? '')
  )
  const [paidAt, setPaidAt] = useState(today())
  const [method, setMethod] = useState('Bank transfer')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await save({
        purchaseOrderId,
        invoiceId,
        amount: Number(amount),
        paidAt,
        method,
        referenceNumber: referenceNumber || null,
        notes: notes || null
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record the payment.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Record supplier payment" close={close}>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="rounded-xl bg-neutral-50 p-4 text-sm">
          <p className="font-medium">Payment is recorded against delivered PO value.</p>
          <p className="mt-1 text-neutral-500">
            A supplier invoice is optional and may be attached later.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier">
            <select
              required
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
          </Field>
          <Field label="Delivered purchase order">
            <select
              required
              className="field"
              value={purchaseOrderId}
              onChange={(event) => {
                const id = Number(event.target.value)
                const nextSummary = payableSummaries.find(
                  (summary) => summary.purchaseOrderId === id
                )
                setPurchaseOrderId(id)
                setInvoiceId(null)
                setAmount(String(nextSummary?.outstandingAmount ?? ''))
              }}
            >
              <option value={0}>Select delivered PO</option>
              {supplierSummaries.map((summary) => (
                <option key={summary.purchaseOrderId} value={summary.purchaseOrderId}>
                  {summary.orderNumber} · {currency.format(summary.outstandingAmount)} remaining
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier invoice (optional)">
            <select
              className="field"
              value={invoiceId ?? ''}
              onChange={(event) =>
                setInvoiceId(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">No invoice uploaded yet</option>
              {matchingInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoiceNumber}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-xl border border-neutral-200 p-3 text-sm">
            <p className="text-neutral-500">Delivered amount owed</p>
            <p className="font-semibold">{currency.format(selectedSummary?.totalAmount ?? 0)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Paid {currency.format(selectedSummary?.paidAmount ?? 0)} · Remaining{' '}
              {currency.format(selectedSummary?.outstandingAmount ?? 0)}
            </p>
          </div>
          <Field label="Payment amount">
            <input
              required
              min="0.01"
              max={selectedSummary?.outstandingAmount}
              step="0.01"
              type="number"
              className="field"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Payment date">
            <input
              required
              type="date"
              className="field"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </Field>
          <Field label="Method">
            <select
              required
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
          </Field>
          <Field label="Reference number">
            <input
              className="field"
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            className="field min-h-20"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Actions close={close} saving={saving} label="Record payment" disabled={!purchaseOrderId} />
      </form>
    </Modal>
  )
}

function Modal({
  title,
  close,
  children
}: {
  title: string
  close: VoidFunction
  children: ReactNode
}): ReactElement {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-neutral-950/55 p-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close dialog"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-2xl min-w-0 overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={close} className="icon-button" aria-label="Close dialog">
            <FiX />
          </button>
        </div>
        {children}
      </section>
    </div>
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
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" className="secondary-button" onClick={close}>
        Cancel
      </button>
      <button disabled={saving || disabled} className="primary-button">
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
    <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3">
      <span className={tone}>{icon}</span>
      <div>
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  )
}
