import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import ProcurementRecords from '@renderer/components/suppliers/ProcurementRecords'
import { useConfirm } from '@renderer/components/ui/ConfirmDialog'
import { splitErrors, type FieldErrors } from '@renderer/components/ui/fieldErrors'
import FilteredInput from '@renderer/components/ui/FilteredInput'
import FormField, { FormError, RequiredNote } from '@renderer/components/ui/FormField'
import Modal from '@renderer/components/ui/Modal'
import PageHeader, { EmptyState } from '@renderer/components/ui/PageHeader'
import type { ItemBatch, ItemProfile } from '@renderer/data/profiles'
import type {
  DeliveryFormValues,
  OrderStatus,
  PurchaseOrderFormValues,
  SupplierFormValues
} from '@renderer/data/supplierOrders'
import {
  orderStatusHelp,
  orderStatusLabels,
  orderStatusTone,
  procurementTabs,
  type ProcurementTab,
  type PurchaseOrderRecord
} from '@renderer/data/supplierOrders'
import { useAccount } from '@renderer/hooks/useAccount'
import { useSupplierOrders } from '@renderer/hooks/useSupplierOrders'
import { filterInput, type InputRule } from '@shared/inputRules'
import { EXPIRY_WARNING_DAYS, getExpiryStatus, localDate } from '@shared/inventory'
import type { Supplier } from '@shared/types'
import type { StockUnit } from '@shared/units'
import { Link } from '@tanstack/react-router'
import { useMemo, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import {
  FiArchive,
  FiCheck,
  FiEdit2,
  FiFileText,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiSlash,
  FiTrash2,
  FiTruck,
  FiX
} from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

/** Empty input becomes NaN so validation reports "enter a number" instead of silently using 0. */
const toNumber = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value))

const remaining = (item: PurchaseOrderRecord['items'][number]): number =>
  Math.max(item.quantity - item.receivedQuantity, 0)

/** "3 boxes" / "5 pcs" in the line's own order unit. */
const units = (count: number, item: { unit: StockUnit }): string =>
  item.unit === 'box'
    ? `${count} box${count === 1 ? '' : 'es'}`
    : `${count} pc${count === 1 ? '' : 's'}`

const unitName = (item: { unit: StockUnit; piecesPerUnit: number }): string =>
  item.unit === 'box' ? `box of ${item.piecesPerUnit}` : 'piece'

const canReceive = (order: PurchaseOrderRecord): boolean =>
  ['submitted', 'partially_received'].includes(order.status) &&
  order.items.some((item) => remaining(item) > 0)

const blankSupplier: SupplierFormValues = {
  organization: '',
  person: '',
  phone: '',
  telephone: null,
  email: null,
  street: '',
  city: '',
  country: 'Philippines',
  province: '',
  postalCode: ''
}

const tabDescriptions: Record<ProcurementTab, string> = {
  suppliers:
    'Companies you buy stock from. A supplier is needed before you can create a purchase order.',
  orders:
    'Create, edit and submit purchase orders. Drafts can be changed until they are submitted to the supplier.',
  receiving:
    'Record products that arrived against a submitted purchase order, with their batch number and expiry date.',
  invoices:
    'Attach supplier invoices to received orders and record payments against the balance due.',
  history: 'Every delivery, invoice and payment recorded for your purchase orders.'
}

const workflow: Array<{ tab: ProcurementTab; label: string; hint: string }> = [
  { tab: 'orders', label: 'Create Purchase Order', hint: 'Save as draft, then submit' },
  { tab: 'receiving', label: 'Receive Products', hint: 'Batch, expiry and quantity' },
  { tab: 'invoices', label: 'Review Invoice', hint: 'Attach the supplier invoice' },
  { tab: 'invoices', label: 'Record Payment', hint: 'When payment is made' }
]

/**
 * Shows the purchasing workflow in order so staff know which tab handles each step.
 */
function WorkflowSteps({
  tab,
  setTab,
  counts
}: {
  tab: ProcurementTab
  setTab: (tab: ProcurementTab) => void
  counts: { drafts: number; awaiting: number }
}): ReactElement {
  return (
    <nav aria-label="Purchasing workflow" className="panel overflow-x-auto">
      <ol className="flex min-w-[640px] divide-x divide-slate-200">
        {workflow.map((step, index) => {
          const active = step.tab === tab
          const count =
            step.tab === 'orders' && counts.drafts > 0
              ? `${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}`
              : step.tab === 'receiving' && counts.awaiting > 0
                ? `${counts.awaiting} waiting`
                : null
          return (
            <li key={step.label} className="flex-1">
              <button
                type="button"
                onClick={() => setTab(step.tab)}
                aria-current={active ? 'step' : undefined}
                className={`flex h-full w-full items-center gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-semibold ${active ? 'text-brand-800' : 'text-slate-800'}`}
                  >
                    {step.label}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {step.hint}
                    {count && <span className="ml-1 font-semibold text-amber-700">· {count}</span>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface Feedback {
  message: string
  tone: 'success' | 'error'
  link?: { to: '/inventory'; label: string }
}

export default function SupplierOrders({
  tab,
  onTabChange
}: {
  tab: ProcurementTab
  onTabChange: (tab: ProcurementTab) => void
}): ReactElement {
  const procurement = useSupplierOrders()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [supplierDialog, setSupplierDialog] = useState<Supplier | 'new' | null>(null)
  const [orderDialog, setOrderDialog] = useState<PurchaseOrderRecord | 'new' | null>(null)
  const [receiveDialog, setReceiveDialog] = useState<PurchaseOrderRecord | null>(null)
  const [feedback, setFeedbackState] = useState<Feedback | null>(null)
  const [confirmDialog, confirm] = useConfirm()

  const setFeedback = (message: string, tone: Feedback['tone'] = 'success'): void =>
    setFeedbackState(message ? { message, tone } : null)
  const fail = (cause: unknown, fallback: string): void =>
    setFeedback(cause instanceof Error ? cause.message : fallback, 'error')

  const setTab = (next: ProcurementTab): void => {
    setQuery('')
    setStatus('all')
    onTabChange(next)
  }

  const filteredSuppliers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return procurement.suppliers.filter((supplier) => {
      if (!normalized) return true
      return `${supplier.organization} ${supplier.person} ${supplier.city} ${supplier.phone}`
        .toLowerCase()
        .includes(normalized)
    })
  }, [procurement.suppliers, query])

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return procurement.orders.filter((order) => {
      const matchesStatus = status === 'all' || order.status === status
      const matchesQuery =
        !normalized ||
        `${order.orderNumber} ${order.supplierName} ${order.createdByName} ${order.items.map((item) => item.productName).join(' ')}`
          .toLowerCase()
          .includes(normalized)
      return matchesStatus && matchesQuery
    })
  }, [procurement.orders, query, status])

  const awaitingDelivery = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return procurement.orders.filter(
      (order) =>
        canReceive(order) &&
        (!normalized ||
          `${order.orderNumber} ${order.supplierName} ${order.items.map((item) => item.productName).join(' ')}`
            .toLowerCase()
            .includes(normalized))
    )
  }, [procurement.orders, query])

  const removeSupplier = async (supplier: Supplier): Promise<void> => {
    const accepted = await confirm({
      title: 'Remove supplier?',
      message: (
        <>
          <strong>{supplier.organization}</strong> will be removed from the supplier list. Suppliers
          with purchase orders or stock batches are kept to protect their history.
        </>
      ),
      confirmLabel: 'Remove Supplier',
      tone: 'danger'
    })
    if (!accepted) return
    try {
      await procurement.deleteSupplier(supplier.id)
      setFeedback(`${supplier.organization} removed.`)
    } catch (cause) {
      fail(cause, 'Unable to remove the supplier.')
    }
  }

  const submitOrder = async (order: PurchaseOrderRecord): Promise<void> => {
    const accepted = await confirm({
      title: `Submit ${order.orderNumber}?`,
      message:
        'Submit this order once it has been sent to the supplier. Submitted orders can no longer be edited, but you can record deliveries against them.',
      confirmLabel: 'Submit Order'
    })
    if (!accepted) return
    try {
      await procurement.updateOrderStatus(order.id, 'submitted')
      setFeedback(`${order.orderNumber} submitted. Record deliveries under Receiving.`)
    } catch (cause) {
      fail(cause, 'Unable to submit the order.')
    }
  }

  const cancelOrder = async (order: PurchaseOrderRecord): Promise<void> => {
    const undelivered = order.items.reduce((total, item) => total + remaining(item), 0)
    const received = order.items.some((item) => item.receivedQuantity > 0)
    const accepted = await confirm({
      title: `Cancel ${order.orderNumber}?`,
      message: (
        <>
          <p>
            <strong>Cancellation is permanent.</strong> The order will be closed and its status can
            no longer be changed or edited.
          </p>
          <p className="mt-2">
            {received
              ? `The ${undelivered} undelivered unit(s) will be cancelled. Stock already received stays in inventory and remains payable to the supplier.`
              : 'No deliveries can be recorded against it afterwards. Create a new order if you still need these items.'}
          </p>
        </>
      ),
      confirmLabel: 'Cancel Order',
      cancelLabel: 'Keep order',
      tone: 'danger'
    })
    if (!accepted) return
    try {
      await procurement.updateOrderStatus(order.id, 'cancelled')
      setFeedback(`${order.orderNumber} cancelled.`)
    } catch (cause) {
      fail(cause, 'Unable to cancel the order.')
    }
  }

  const removeOrder = async (order: PurchaseOrderRecord): Promise<void> => {
    const accepted = await confirm({
      title: `Delete ${order.orderNumber}?`,
      message: 'The order and its lines will be permanently deleted.',
      confirmLabel: 'Delete Order',
      tone: 'danger'
    })
    if (!accepted) return
    try {
      await procurement.deleteOrder(order.id)
      setFeedback('Purchase order deleted.')
    } catch (cause) {
      fail(cause, 'Unable to delete the order.')
    }
  }

  const primaryAction =
    tab === 'suppliers'
      ? { label: 'Add Supplier', run: () => setSupplierDialog('new') }
      : tab === 'orders' || tab === 'receiving'
        ? { label: 'Create Purchase Order', run: () => setOrderDialog('new') }
        : null

  return (
    <DashboardShell pageTitle="Suppliers & Purchasing">
      <div className="space-y-5 lg:space-y-6">
        <PageHeader
          section="Stock & Purchasing"
          title={procurementTabs.find((item) => item.id === tab)?.label ?? 'Suppliers & Purchasing'}
          description={tabDescriptions[tab]}
          actions={
            primaryAction && (
              <button
                type="button"
                className="primary-button whitespace-nowrap"
                onClick={primaryAction.run}
              >
                <FiPlus aria-hidden="true" /> {primaryAction.label}
              </button>
            )
          }
        />
        <WorkflowSteps
          tab={tab}
          setTab={setTab}
          counts={{
            drafts: procurement.orders.filter((order) => order.status === 'draft').length,
            awaiting: procurement.orders.filter(canReceive).length
          }}
        />
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Suppliers" value={procurement.suppliers.length} icon={<FiTruck />} />
          <Metric
            label="Open Orders"
            value={
              procurement.orders.filter((order) =>
                ['draft', 'submitted', 'partially_received'].includes(order.status)
              ).length
            }
            icon={<FiFileText />}
          />
          <Metric
            label="Awaiting Delivery"
            value={procurement.orders.filter(canReceive).length}
            icon={<FiCheck />}
          />
          <Metric
            label="Open Order Value"
            value={currency.format(
              procurement.orders
                .filter((order) => !['received', 'cancelled'].includes(order.status))
                .reduce((total, order) => total + order.totalAmount, 0)
            )}
            icon={<FiArchive />}
          />
        </section>
        {procurement.error && (
          <Banner tone="error">
            <span>{procurement.error}</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void procurement.refresh()}
            >
              Try Again
            </button>
          </Banner>
        )}
        {feedback && (
          <Banner tone={feedback.tone}>
            <span>
              {feedback.message}{' '}
              {feedback.link && (
                <Link to={feedback.link.to} className="font-semibold underline">
                  {feedback.link.label}
                </Link>
              )}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setFeedbackState(null)}
            >
              <FiX />
            </button>
          </Banner>
        )}
        <section className="table-surface">
          <div className="surface-header flex flex-col gap-4 p-4 sm:p-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div
              className="flex w-full overflow-x-auto rounded-lg border border-slate-200/80 bg-white p-1 shadow-sm 2xl:w-auto"
              role="tablist"
              aria-label="Procurement views"
            >
              {procurementTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex-1 shrink-0 rounded-md px-4 py-2 text-sm font-semibold whitespace-nowrap transition sm:flex-none ${tab === item.id ? 'bg-sidebar-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row 2xl:justify-end">
              <label className="relative min-w-0 sm:w-72">
                <span className="sr-only">Search {tab}</span>
                <FiSearch className="absolute top-3 left-3.5 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="field mt-0 pl-10"
                  placeholder={
                    tab === 'suppliers'
                      ? 'Search suppliers'
                      : tab === 'orders'
                        ? 'Search order number or supplier'
                        : tab === 'receiving'
                          ? 'Search order, product or batch'
                          : 'Search procurement records'
                  }
                />
              </label>
              {tab === 'orders' && (
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as OrderStatus | 'all')}
                  className="field mt-0 sm:w-48"
                  aria-label="Filter by order status"
                >
                  <option value="all">All statuses</option>
                  {(Object.keys(orderStatusLabels) as OrderStatus[]).map((value) => (
                    <option key={value} value={value}>
                      {orderStatusLabels[value]}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="secondary-button"
                onClick={() => void procurement.refresh()}
                disabled={procurement.isLoading}
              >
                <FiRefreshCw className={procurement.isLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>
          {tab === 'suppliers' ? (
            <SupplierTable
              suppliers={filteredSuppliers}
              remove={(supplier) => void removeSupplier(supplier)}
              edit={setSupplierDialog}
              isLoading={procurement.isLoading}
            />
          ) : tab === 'orders' ? (
            <OrderTable
              orders={filteredOrders}
              isLoading={procurement.isLoading}
              edit={setOrderDialog}
              submit={(order) => void submitOrder(order)}
              cancel={(order) => void cancelOrder(order)}
              receive={setReceiveDialog}
              remove={(order) => void removeOrder(order)}
            />
          ) : (
            <>
              {tab === 'receiving' && (
                <AwaitingDelivery
                  orders={awaitingDelivery}
                  isLoading={procurement.isLoading}
                  receive={setReceiveDialog}
                />
              )}
              <ProcurementRecords
                view={tab}
                query={query}
                procurement={procurement}
                feedback={(message, tone) => setFeedback(message, tone)}
              />
            </>
          )}
        </section>
      </div>
      {supplierDialog && (
        <SupplierDialog
          initial={supplierDialog === 'new' ? null : supplierDialog}
          close={() => setSupplierDialog(null)}
          save={async (values, id) => {
            await procurement.saveSupplier(values, id)
            setSupplierDialog(null)
            setFeedback(id ? 'Supplier updated.' : 'Supplier added.')
          }}
        />
      )}
      {orderDialog && (
        <OrderDialog
          initial={orderDialog === 'new' ? null : orderDialog}
          suppliers={procurement.suppliers}
          products={procurement.products}
          close={() => setOrderDialog(null)}
          save={async (values) => {
            if (orderDialog === 'new') await procurement.createOrder(values)
            else await procurement.updateOrder(orderDialog.id, values)
            setFeedback(
              orderDialog === 'new'
                ? 'Purchase order saved as a draft. Submit it once it has been sent to the supplier.'
                : `${orderDialog.orderNumber} updated.`
            )
            setOrderDialog(null)
          }}
        />
      )}
      {receiveDialog && (
        <ReceiveDialog
          order={receiveDialog}
          products={procurement.products}
          close={() => setReceiveDialog(null)}
          save={async (values) => {
            await procurement.receiveOrder(receiveDialog.id, values)
            const units = values.items.reduce((total, item) => total + item.receivedQuantity, 0)
            setReceiveDialog(null)
            setFeedbackState({
              message: `Delivery recorded for ${receiveDialog.orderNumber}: ${units} unit(s) added to inventory.`,
              tone: 'success',
              link: { to: '/inventory', label: 'View Inventory' }
            })
          }}
        />
      )}
      {confirmDialog}
    </DashboardShell>
  )
}

function Banner({
  tone,
  children
}: {
  tone: 'success' | 'error'
  children: ReactNode
}): ReactElement {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm ${tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
    >
      {children}
    </div>
  )
}

function SupplierTable({
  suppliers,
  isLoading,
  edit,
  remove
}: {
  suppliers: Supplier[]
  isLoading: boolean
  edit: (supplier: Supplier | 'new') => void
  remove: (supplier: Supplier) => void
}): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="surface-header text-left text-slate-500">
          <tr>
            <th className="px-5 py-3">Supplier</th>
            <th className="px-5 py-3">Contact</th>
            <th className="px-5 py-3">Location</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/90">
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="hover:bg-brand-50/50 transition-colors">
              <td className="px-5 py-4">
                <p className="font-semibold text-slate-900">{supplier.organization}</p>
                <p className="text-xs text-slate-500">{supplier.person}</p>
              </td>
              <td className="px-5 py-4">
                <p>{supplier.phone}</p>
                <p className="text-xs text-slate-500">
                  {supplier.email || supplier.telephone || 'No secondary contact'}
                </p>
              </td>
              <td className="px-5 py-4 text-slate-600">
                {supplier.city}, {supplier.province}
              </td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => edit(supplier)}
                    aria-label={`View or edit ${supplier.organization}`}
                  >
                    <FiEdit2 aria-hidden="true" /> View / Edit
                  </button>
                  <button
                    type="button"
                    className="icon-button text-rose-700"
                    aria-label={`Remove ${supplier.organization}`}
                    title="Remove Supplier"
                    onClick={() => remove(supplier)}
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!isLoading && suppliers.length === 0 && (
        <EmptyState
          title="No suppliers to show."
          description="Clear the search, or add a supplier with Add supplier above. Suppliers are needed before you can create a purchase order."
        />
      )}
      {isLoading && suppliers.length === 0 && <EmptyState title="Loading suppliers…" />}
    </div>
  )
}

function StatusBadge({ status }: { status: OrderStatus }): ReactElement {
  return (
    <span className={`status-badge ${orderStatusTone[status]}`} title={orderStatusHelp[status]}>
      {orderStatusLabels[status]}
    </span>
  )
}

function OrderTable({
  orders,
  isLoading,
  edit,
  submit,
  cancel,
  receive,
  remove
}: {
  orders: PurchaseOrderRecord[]
  isLoading: boolean
  edit: (order: PurchaseOrderRecord) => void
  submit: (order: PurchaseOrderRecord) => void
  cancel: (order: PurchaseOrderRecord) => void
  receive: (order: PurchaseOrderRecord) => void
  remove: (order: PurchaseOrderRecord) => void
}): ReactElement {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[860px] table-fixed text-sm">
        <colgroup>
          <col className="w-[21%]" />
          <col className="w-[17%]" />
          <col className="w-[13%]" />
          <col className="w-[33%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead className="surface-header text-left text-slate-500">
          <tr>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Supplier</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Items: Ordered · Received · Remaining</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/90">
          {orders.map((order) => {
            const received = order.items.some((item) => item.receivedQuantity > 0)
            const cancellable = ['draft', 'submitted', 'partially_received'].includes(order.status)
            return (
              <tr key={order.id} className="hover:bg-brand-50/50 align-top transition-colors">
                <td className="min-w-0 px-4 py-4">
                  <p className="truncate font-semibold text-slate-900" title={order.orderNumber}>
                    {order.orderNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    Ordered {date.format(new Date(order.orderedAt))}
                  </p>
                  {order.expectedAt && (
                    <p className="text-xs text-slate-500">
                      Expected {date.format(new Date(order.expectedAt))}
                    </p>
                  )}
                  <p className="mt-1 text-xs font-semibold">{currency.format(order.totalAmount)}</p>
                  <dl className="mt-2 space-y-0.5 text-xs text-slate-500">
                    <div>
                      <dt className="inline">Created by </dt>
                      <dd className="inline text-slate-700">{order.createdByName}</dd>
                    </div>
                    {order.status !== 'draft' && (
                      <div>
                        <dt className="inline">Submitted by </dt>
                        <dd className="inline text-slate-700">
                          {order.submittedByName ?? 'Not recorded'}
                        </dd>
                      </div>
                    )}
                    {order.status === 'cancelled' && (
                      <div>
                        <dt className="inline">Cancelled by </dt>
                        <dd className="inline text-slate-700">
                          {order.cancelledByName ?? 'Not recorded'}
                        </dd>
                      </div>
                    )}
                  </dl>
                </td>
                <td className="min-w-0 px-4 py-4">
                  <p className="truncate" title={order.supplierName}>
                    {order.supplierName}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={order.status} />
                </td>
                <td className="min-w-0 px-4 py-4 text-slate-600">
                  <ul className="space-y-1.5">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span
                          className="block truncate font-medium text-slate-800"
                          title={item.productName}
                        >
                          {item.productName}
                        </span>
                        <span className="block text-xs text-slate-500 tabular-nums">
                          {units(item.quantity, item)} ordered
                          {item.unit === 'box' ? ` (×${item.piecesPerUnit} pcs)` : ''} ·{' '}
                          {item.receivedQuantity} received ·{' '}
                          <span
                            className={
                              remaining(item) > 0 && order.status !== 'cancelled'
                                ? 'font-semibold text-amber-700'
                                : ''
                            }
                          >
                            {order.status === 'cancelled' && remaining(item) > 0
                              ? `${remaining(item)} cancelled`
                              : `${remaining(item)} remaining`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {order.notes && (
                    <p
                      className="mt-2 line-clamp-2 text-xs break-words text-slate-500"
                      title={order.notes}
                    >
                      Note: {order.notes}
                    </p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col items-stretch gap-2">
                    {canReceive(order) && (
                      <button
                        type="button"
                        className="primary-button h-10 text-xs"
                        onClick={() => receive(order)}
                      >
                        <FiTruck /> Receive Products
                      </button>
                    )}
                    {order.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          className="primary-button h-10 text-xs"
                          onClick={() => submit(order)}
                        >
                          <FiSend /> Submit Order
                        </button>
                        <button
                          type="button"
                          className="secondary-button text-xs"
                          onClick={() => edit(order)}
                        >
                          <FiEdit2 /> Edit
                        </button>
                      </>
                    )}
                    {cancellable && (
                      <button
                        type="button"
                        className="secondary-button text-xs text-rose-700"
                        onClick={() => cancel(order)}
                      >
                        <FiSlash /> Cancel Order
                      </button>
                    )}
                    {(order.status === 'draft' || (order.status === 'cancelled' && !received)) && (
                      <button
                        type="button"
                        className="secondary-button text-xs text-rose-700"
                        onClick={() => remove(order)}
                      >
                        <FiTrash2 /> Delete
                      </button>
                    )}
                    {order.status !== 'draft' && (
                      <p className="text-xs leading-5 text-slate-500">
                        {orderStatusHelp[order.status]}
                        {['submitted', 'partially_received'].includes(order.status) &&
                          ' Editing is locked after submission.'}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!isLoading && orders.length === 0 && (
        <EmptyState
          title="No purchase orders to show."
          description="Clear the search or status filter, or use Create purchase order to order stock from a supplier."
        />
      )}
      {isLoading && orders.length === 0 && <EmptyState title="Loading purchase orders…" />}
    </div>
  )
}

function AwaitingDelivery({
  orders,
  isLoading,
  receive
}: {
  orders: PurchaseOrderRecord[]
  isLoading: boolean
  receive: (order: PurchaseOrderRecord) => void
}): ReactElement {
  return (
    <section className="border-b border-slate-200 p-4 sm:p-5">
      <h3 className="section-title text-lg">Orders Waiting for Delivery</h3>
      <p className="section-subtitle">
        Pick the submitted purchase order that matches the supplier’s delivery receipt, then enter
        what actually arrived. Draft orders must be submitted first under Purchase orders.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {orders.map((order) => (
          <article
            key={order.id}
            className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-slate-200 bg-white p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{order.orderNumber}</p>
              <p className="truncate text-sm text-slate-600">{order.supplierName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {order.items.filter((item) => remaining(item) > 0).length} line(s) still to receive
                {order.expectedAt ? ` · expected ${date.format(new Date(order.expectedAt))}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <StatusBadge status={order.status} />
              <button
                type="button"
                className="primary-button h-9 text-xs"
                onClick={() => receive(order)}
              >
                <FiTruck /> Receive Products
              </button>
            </div>
          </article>
        ))}
      </div>
      {!isLoading && orders.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No submitted purchase orders are waiting for delivery. Submit a draft order under Purchase
          orders once it has been sent to the supplier.
        </p>
      )}
    </section>
  )
}

function SupplierDialog({
  initial,
  close,
  save
}: {
  initial: Supplier | null
  close: VoidFunction
  save: (values: SupplierFormValues, id?: number) => Promise<void>
}): ReactElement {
  const [values, setValues] = useState<SupplierFormValues>(() => {
    if (!initial) return blankSupplier
    const { id, ...supplierValues } = initial
    void id
    return supplierValues
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const set = (key: keyof SupplierFormValues, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setErrors({})
    try {
      await save(
        {
          ...values,
          telephone: values.telephone?.trim() || null,
          email: values.email?.trim() || null
        },
        initial?.id
      )
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to save the supplier.')
      setErrors(result.fields)
      setError(result.form)
      setSaving(false)
    }
  }
  const input = (
    key: keyof SupplierFormValues,
    options: {
      placeholder?: string
      inputMode?: 'numeric' | 'tel'
      maxLength?: number
      type?: string
      /** Blocks characters the field does not accept while typing. */
      rule?: InputRule
    } = {}
  ): ReactElement => {
    const { rule, ...rest } = options
    return (
      <input
        className="field"
        autoComplete="off"
        value={values[key] ?? ''}
        onChange={(event) =>
          set(key, rule ? filterInput(rule, event.target.value).value : event.target.value)
        }
        {...rest}
      />
    )
  }
  return (
    <Modal
      title={initial ? `Supplier: ${initial.organization}` : 'Add supplier'}
      description={initial ? 'Review or update the supplier details.' : undefined}
      close={close}
      busy={saving}
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <RequiredNote />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Organization" required error={errors.organization}>
            {input('organization', {
              placeholder: 'e.g. MedSupply Distribution',
              maxLength: 120,
              rule: 'catalogText'
            })}
          </FormField>
          <FormField label="Contact Person" required error={errors.person}>
            {input('person', {
              placeholder: 'e.g. Juan Dela Cruz',
              maxLength: 120,
              rule: 'personName'
            })}
          </FormField>
          <FormField
            label="Mobile Phone"
            required
            hint="11 digits starting with 09. Numbers only."
            error={errors.phone}
          >
            {input('phone', {
              placeholder: '09171234567',
              inputMode: 'numeric',
              maxLength: 12,
              rule: 'phone'
            })}
          </FormField>
          <FormField label="Telephone" error={errors.telephone}>
            {input('telephone', {
              placeholder: 'e.g. (082) 123 4567',
              inputMode: 'tel',
              maxLength: 20,
              rule: 'telephone'
            })}
          </FormField>
          <FormField label="Email" error={errors.email} className="sm:col-span-2">
            {input('email', {
              rule: 'email',
              type: 'email',
              placeholder: 'e.g. orders@supplier.ph',
              maxLength: 254
            })}
          </FormField>
          <FormField label="Street" required error={errors.street}>
            {input('street', { placeholder: 'e.g. 123 Rizal Street', maxLength: 500 })}
          </FormField>
          <FormField label="City" required error={errors.city}>
            {input('city', { placeholder: 'e.g. Davao City', maxLength: 100 })}
          </FormField>
          <FormField label="Province" required error={errors.province}>
            {input('province', { placeholder: 'e.g. Davao del Sur', maxLength: 100 })}
          </FormField>
          <FormField label="Postal Code" required hint="4 digits." error={errors.postalCode}>
            {input('postalCode', {
              placeholder: '8000',
              inputMode: 'numeric',
              maxLength: 4,
              rule: 'phone'
            })}
          </FormField>
          <FormField label="Country" required error={errors.country}>
            {input('country', { maxLength: 100 })}
          </FormField>
        </div>
        <FormError message={error} />
        <DialogActions
          close={close}
          saving={saving}
          label={initial ? 'Save changes' : 'Add supplier'}
        />
      </form>
    </Modal>
  )
}

let nextLineKey = 0
interface OrderLineDraft {
  key: number
  drugId: string
  quantity: string
  unitCost: string
  unit: StockUnit
}

function OrderDialog({
  initial,
  suppliers,
  products,
  close,
  save
}: {
  initial: PurchaseOrderRecord | null
  suppliers: Supplier[]
  products: ItemProfile[]
  close: VoidFunction
  save: (values: PurchaseOrderFormValues) => Promise<void>
}): ReactElement {
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? 0)
  const [expectedAt, setExpectedAt] = useState(initial?.expectedAt?.slice(0, 10) ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  // Note: Orders are per box only. A draft saved earlier with piece lines is converted to boxes
  // when the piece count fills whole boxes; otherwise its quantity is cleared to be re-entered.
  const [converted, setConverted] = useState<string[]>([])
  const [lines, setLines] = useState<OrderLineDraft[]>(() => {
    const notes: string[] = []
    const result: OrderLineDraft[] = initial
      ? initial.items.map((item) => {
          if (item.unit === 'box')
            return {
              key: nextLineKey++,
              drugId: String(item.drugId),
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
              unit: 'box'
            }
          const perBox = Math.max(
            1,
            products.find((product) => product.id === item.drugId)?.piecesPerBox ?? 1
          )
          const whole = item.quantity % perBox === 0
          notes.push(
            whole
              ? `${item.productName}: ${item.quantity} pieces converted to ${item.quantity / perBox} box(es) of ${perBox}.`
              : `${item.productName}: ${item.quantity} pieces do not fill whole boxes of ${perBox}. Enter the number of boxes.`
          )
          return {
            key: nextLineKey++,
            drugId: String(item.drugId),
            quantity: whole ? String(item.quantity / perBox) : '',
            unitCost: String(Number((item.unitCost * perBox).toFixed(2))),
            unit: 'box'
          }
        })
      : [{ key: nextLineKey++, drugId: '', quantity: '', unitCost: '', unit: 'box' }]
    if (notes.length) queueMicrotask(() => setConverted(notes))
    return result
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const minimumDate = initial ? initial.orderedAt.slice(0, 10) : localDate()
  const total = lines.reduce((sum, line) => {
    const value = Number(line.quantity) * Number(line.unitCost)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)

  const updateLine = (
    index: number,
    field: keyof Omit<OrderLineDraft, 'key'>,
    value: string
  ): void => {
    setLines((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    )
    setErrors((current) => ({ ...current, [`items.${index}.${field}`]: '' }))
    setError('')
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setErrors({})
    try {
      await save({
        supplierId,
        expectedAt: expectedAt || null,
        notes: notes.trim() || null,
        items: lines.map((line) => ({
          drugId: Number(line.drugId),
          quantity: toNumber(line.quantity),
          unitCost: toNumber(line.unitCost),
          unit: line.unit
        }))
      })
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to save the purchase order.', (path, field) =>
        path.startsWith('items.') && path.split('.').length === 3
          ? path
          : field === 'items'
            ? null
            : field
      )
      setErrors(result.fields)
      setError(result.form)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={initial ? `Edit ${initial.orderNumber}` : 'Create purchase order'}
      description={
        initial
          ? 'Draft orders can be changed until they are submitted to the supplier.'
          : 'The order is saved as a draft. Submit it once it has been sent to the supplier, then receive the products when they arrive.'
      }
      close={close}
      size="lg"
      busy={saving}
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <RequiredNote />
        {(suppliers.length === 0 || products.length === 0) && (
          <FormError
            message={
              suppliers.length === 0
                ? 'Add a supplier before creating a purchase order.'
                : 'Add a product to the inventory catalog before creating a purchase order.'
            }
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Supplier" required error={errors.supplierId}>
            <select
              className="field"
              value={supplierId}
              onChange={(event) => {
                setSupplierId(Number(event.target.value))
                setErrors((current) => ({ ...current, supplierId: '' }))
              }}
            >
              <option value={0}>Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.organization}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Order Date"
            showOptional={false}
            hint="Set automatically when the order is created."
          >
            <input type="date" className="field" value={minimumDate} readOnly />
          </FormField>
          <FormField
            label="Expected Delivery Date"
            hint="Cannot be before the order date."
            error={errors.expectedAt}
            className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]"
          >
            <input
              type="date"
              className="field"
              min={minimumDate}
              value={expectedAt}
              onChange={(event) => {
                setExpectedAt(event.target.value)
                setErrors((current) => ({ ...current, expectedAt: '' }))
              }}
            />
          </FormField>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">
                Products Ordered<span className="required-mark">*</span>
              </p>
              <p className="text-xs text-slate-500">
                Supplier orders are by the box only. Enter the number of boxes and the supplier’s
                cost per box; stock is added in pieces when the boxes are received.
              </p>
            </div>
            <button
              type="button"
              className="secondary-button text-xs"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { key: nextLineKey++, drugId: '', quantity: '', unitCost: '', unit: 'box' }
                ])
              }
              disabled={products.length === 0}
            >
              <FiPlus /> Add Product
            </button>
          </div>
          {converted.length > 0 && (
            <div
              role="status"
              className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
            >
              <p className="font-semibold">
                This draft had lines ordered by the piece. Orders are now per box:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {converted.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="hidden grid-cols-[minmax(0,1fr)_6rem_7.5rem_8rem_7rem_2.5rem] gap-2 px-2 pb-1 text-xs font-semibold text-slate-600 sm:grid">
            <span>Product</span>
            <span>Boxes</span>
            <span>Box Size</span>
            <span>Cost per Box (₱)</span>
            <span className="text-right">Line Total</span>
            <span />
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => {
              const lineError =
                errors[`items.${index}.drugId`] ||
                errors[`items.${index}.quantity`] ||
                errors[`items.${index}.unitCost`]
              const lineTotal = Number(line.quantity) * Number(line.unitCost)
              const piecesPerBox =
                products.find((product) => String(product.id) === line.drugId)?.piecesPerBox ?? 1
              return (
                <div key={line.key} className="rounded-md border border-slate-200 bg-white p-2">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7.5rem_8rem_7rem_2.5rem] sm:items-center">
                    <select
                      className="field mt-0 truncate pr-8"
                      aria-label={`Product for line ${index + 1}`}
                      aria-invalid={errors[`items.${index}.drugId`] ? true : undefined}
                      title={
                        products.find((product) => String(product.id) === line.drugId)
                          ? `${products.find((product) => String(product.id) === line.drugId)?.brandName}`
                          : undefined
                      }
                      value={line.drugId}
                      onChange={(event) => updateLine(index, 'drugId', event.target.value)}
                    >
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.brandName} · {product.genericName} · {product.formulation}
                        </option>
                      ))}
                    </select>
                    <input
                      min="1"
                      step="1"
                      type="number"
                      inputMode="numeric"
                      className="field mt-0"
                      aria-label={`Quantity for line ${index + 1}`}
                      aria-invalid={errors[`items.${index}.quantity`] ? true : undefined}
                      placeholder="Boxes"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, 'quantity', event.target.value)}
                    />
                    {/* Note: Plain text instead of a select, so the box size is never clipped. */}
                    <span
                      className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm whitespace-nowrap text-slate-700"
                      aria-label={`Box size for line ${index + 1}`}
                    >
                      {line.drugId ? `${Math.max(1, piecesPerBox)} pcs/box` : '—'}
                    </span>
                    <input
                      min="0"
                      step="0.01"
                      type="number"
                      inputMode="decimal"
                      className="field mt-0"
                      aria-label={`Cost per box for line ${index + 1}`}
                      aria-invalid={errors[`items.${index}.unitCost`] ? true : undefined}
                      placeholder="0.00"
                      value={line.unitCost}
                      onChange={(event) => updateLine(index, 'unitCost', event.target.value)}
                    />
                    <span className="text-right text-sm font-medium text-slate-700 tabular-nums">
                      {Number.isFinite(lineTotal) ? currency.format(lineTotal) : '—'}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <FiX />
                    </button>
                  </div>
                  {lineError && (
                    <p className="mt-1 px-1 text-xs font-medium text-rose-700">{lineError}</p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-right text-sm font-semibold">
            Order total: <span className="tabular-nums">{currency.format(total)}</span>
          </p>
        </div>
        <FormField label="Notes" error={errors.notes}>
          <textarea
            className="field min-h-20"
            maxLength={500}
            placeholder="e.g. Deliver before month end"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
        <FormError message={error} />
        <DialogActions
          close={close}
          saving={saving}
          label={initial ? 'Save changes' : 'Create purchase order'}
          disabled={suppliers.length === 0 || products.length === 0}
        />
      </form>
    </Modal>
  )
}

interface ReceiveLine {
  receivedQuantity: string
  batchNumber: string
  sellPrice: string
  boxSellPrice: string
  expiresAt: string
}

function ReceiveDialog({
  order,
  products,
  close,
  save
}: {
  order: PurchaseOrderRecord
  products: ItemProfile[]
  close: VoidFunction
  save: (values: DeliveryFormValues) => Promise<void>
}): ReactElement {
  const [deliveredAt, setDeliveredAt] = useState(localDate())
  // Note: One request ID per dialog lets the main process ignore a repeated submission.
  const [requestId] = useState(() => crypto.randomUUID())
  const submitting = useRef(false)
  const [notes, setNotes] = useState('')
  const { account } = useAccount()
  const [deliveredByName, setDeliveredByName] = useState('')
  // Note: Defaults to the person recording; change it when someone else checked the goods.
  const [checkedByName, setCheckedByName] = useState(account?.fullName ?? '')
  const openItems = order.items.filter((item) => remaining(item) > 0)
  const [lines, setLines] = useState<Record<number, ReceiveLine>>(() =>
    Object.fromEntries(
      openItems.map((item) => {
        // Note: Suggest the product's current selling price; staff confirm it per delivery.
        const latest = products
          .find((product) => product.id === item.drugId)
          ?.batches.reduce<{ id: number; sellPrice: number; boxSellPrice: number | null } | null>(
            (best, batch) => (!best || batch.id > best.id ? batch : best),
            null
          )
        return [
          item.id,
          {
            receivedQuantity: String(remaining(item)),
            batchNumber: '',
            sellPrice: latest ? String(latest.sellPrice) : '',
            boxSellPrice: latest?.boxSellPrice != null ? String(latest.boxSellPrice) : '',
            expiresAt: ''
          }
        ]
      })
    )
  )
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')

  const updateLine = (itemId: number, field: keyof ReceiveLine, value: string): void => {
    setLines((current) => ({ ...current, [itemId]: { ...current[itemId], [field]: value } }))
    setErrors((current) => ({ ...current, [`${itemId}.${field}`]: '' }))
    setError('')
  }

  /** Batches of the same product from this order's supplier, which a delivery may add to. */
  const existingBatches = (item: PurchaseOrderRecord['items'][number]): ItemBatch[] =>
    products
      .find((product) => product.id === item.drugId)
      ?.batches.filter((batch) => batch.supplier === order.supplierName) ?? []

  const chooseBatch = (item: PurchaseOrderRecord['items'][number], batchNumber: string): void => {
    updateLine(item.id, 'batchNumber', batchNumber)
    const match = existingBatches(item).find((batch) => batch.batchNumber === batchNumber.trim())
    if (!match) return
    // Note: An existing batch only accepts stock with the same expiry and price, so copy them.
    setLines((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        expiresAt: match.expiresAt.slice(0, 10),
        sellPrice: String(match.sellPrice),
        boxSellPrice: match.boxSellPrice != null ? String(match.boxSellPrice) : ''
      }
    }))
    setErrors((current) => ({
      ...current,
      [`${item.id}.expiresAt`]: '',
      [`${item.id}.sellPrice`]: ''
    }))
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    const nextErrors: FieldErrors = {}
    const delivered = openItems.filter((item) => lines[item.id].receivedQuantity.trim() !== '')
    for (const item of delivered) {
      const quantity = Number(lines[item.id].receivedQuantity)
      if (!Number.isInteger(quantity) || quantity < 0)
        nextErrors[`${item.id}.receivedQuantity`] = 'Enter a whole number of 0 or more.'
      else if (quantity > remaining(item))
        nextErrors[`${item.id}.receivedQuantity`] =
          `Only ${units(remaining(item), item)} remaining. Over-receiving is not allowed.`
      if (quantity > 0) {
        // Note: Plain-language prompts for blanks; the shared schema still checks formats.
        const line = lines[item.id]
        if (!line.batchNumber.trim())
          nextErrors[`${item.id}.batchNumber`] = 'Enter the batch or lot number from the package.'
        if (!line.expiresAt)
          nextErrors[`${item.id}.expiresAt`] = 'Enter the expiry date printed on the package.'
        if (!line.sellPrice.trim())
          nextErrors[`${item.id}.sellPrice`] = 'Enter the selling price per piece.'
        else if (Number(line.sellPrice) < item.unitCost / item.piecesPerUnit - 0.000001)
          nextErrors[`${item.id}.sellPrice`] =
            `The selling price cannot be lower than the unit cost of ${currency.format(item.unitCost / item.piecesPerUnit)} per piece.`
      }
    }
    if (deliveredAt < order.orderedAt.slice(0, 10))
      nextErrors.deliveredAt = 'The delivery date cannot be before the purchase order date.'
    if (deliveredByName.trim().length < 2)
      nextErrors.deliveredByName = "Enter the supplier's delivery person."
    if (checkedByName.trim().length < 2)
      nextErrors.checkedByName = 'Enter who checked the delivery.'
    const deliveredLines = delivered.filter((item) => Number(lines[item.id].receivedQuantity) > 0)
    if (Object.keys(nextErrors).length === 0 && deliveredLines.length === 0) {
      setError('Enter the delivered quantity for at least one product.')
      return
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setError('Check the highlighted fields.')
      return
    }
    submitting.current = true
    setSaving(true)
    setErrors({})
    try {
      await save({
        requestId,
        deliveredAt,
        notes: notes.trim() || null,
        deliveredByName: deliveredByName.trim(),
        checkedByName: checkedByName.trim(),
        items: deliveredLines.map((item) => ({
          itemId: item.id,
          receivedQuantity: Number(lines[item.id].receivedQuantity),
          batchNumber: lines[item.id].batchNumber.trim(),
          sellPrice: toNumber(lines[item.id].sellPrice),
          boxSellPrice: lines[item.id].boxSellPrice.trim()
            ? toNumber(lines[item.id].boxSellPrice)
            : null,
          expiresAt: lines[item.id].expiresAt
        }))
      })
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to record the delivery.', (path, field) => {
        const match = /^items\.(\d+)\.(\w+)$/.exec(path)
        if (match) return `${deliveredLines[Number(match[1])]?.id}.${match[2]}`
        return ['deliveredAt', 'notes', 'deliveredByName', 'checkedByName'].includes(field)
          ? field
          : null
      })
      setErrors(result.fields)
      setError(result.form)
      submitting.current = false
      setSaving(false)
    }
  }

  const cell = (
    itemId: number,
    field: keyof ReceiveLine,
    control: ReactElement,
    warning?: string
  ): ReactElement => (
    <td className="px-2 py-2 align-top">
      {control}
      {errors[`${itemId}.${field}`] && (
        <p className="mt-1 text-xs font-medium text-rose-700">{errors[`${itemId}.${field}`]}</p>
      )}
      {warning && (
        <p role="status" className="mt-1 text-xs font-medium text-amber-700">
          {warning}
        </p>
      )}
    </td>
  )

  return (
    <Modal
      title={`Receive products for ${order.orderNumber}`}
      description={`${order.supplierName}. Enter only what physically arrived. Inventory, batches and the order status are updated together when you save.`}
      close={close}
      size="xl"
      busy={saving}
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <RequiredNote />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Delivery Date" required error={errors.deliveredAt}>
            <input
              type="date"
              className="field"
              min={order.orderedAt.slice(0, 10)}
              max={localDate()}
              value={deliveredAt}
              onChange={(event) => {
                setDeliveredAt(event.target.value)
                setErrors((current) => ({ ...current, deliveredAt: '' }))
              }}
            />
          </FormField>
          <FormField
            label="Delivery Receipt No. / Notes"
            hint="The supplier's DR number helps match the invoice later."
            error={errors.notes}
          >
            <input
              className="field"
              maxLength={500}
              value={notes}
              placeholder="e.g. DR-10234, 2 boxes damaged"
              onChange={(event) => setNotes(event.target.value)}
            />
          </FormField>
          <FormField
            label="Delivered By (Supplier)"
            required
            hint="The supplier's driver or delivery person who handed over the goods. Letters only, e.g. Juan Dela Cruz."
            error={errors.deliveredByName}
          >
            <FilteredInput
              rule="personName"
              maxLength={120}
              value={deliveredByName}
              aria-invalid={errors.deliveredByName ? true : undefined}
              onValueChange={(value) => {
                setDeliveredByName(value)
                setErrors((current) => ({ ...current, deliveredByName: '' }))
              }}
            />
          </FormField>
          <FormField
            label="Checked By"
            required
            hint={`Who counted and inspected the goods. You (${account?.fullName ?? 'signed-in user'}) are recorded as the person entering this delivery.`}
            error={errors.checkedByName}
          >
            <FilteredInput
              rule="personName"
              maxLength={120}
              value={checkedByName}
              aria-invalid={errors.checkedByName ? true : undefined}
              onValueChange={(value) => {
                setCheckedByName(value)
                setErrors((current) => ({ ...current, checkedByName: '' }))
              }}
            />
          </FormField>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-2 py-2 text-right">Ordered</th>
                <th className="px-2 py-2 text-right">Already Received</th>
                <th className="px-2 py-2 text-right">Still to Receive</th>
                <th className="bg-brand-50 text-brand-800 w-28 px-2 py-2">
                  Received now<span className="text-rose-600">*</span>
                </th>
                <th className="w-40 px-2 py-2">
                  Batch number<span className="text-rose-600">*</span>
                </th>
                <th className="w-40 px-2 py-2">
                  Expiry date<span className="text-rose-600">*</span>
                </th>
                <th className="w-32 px-2 py-2">
                  Price per piece (₱)<span className="text-rose-600">*</span>
                </th>
                <th className="w-32 px-2 py-2">Price per Box (₱)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {openItems.map((item) => {
                const line = lines[item.id]
                const active = Number(line.receivedQuantity) > 0
                const piecesPerBox =
                  products.find((product) => product.id === item.drugId)?.piecesPerBox ?? 1
                return (
                  <tr key={item.id} className={active ? '' : 'bg-slate-50/70 text-slate-500'}>
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-slate-800">{item.productName}</p>
                      <p className="text-xs text-slate-500">
                        Cost {currency.format(item.unitCost)} per {unitName(item)}
                        {item.unit === 'box' &&
                          ` (${currency.format(item.unitCost / item.piecesPerUnit)} per piece)`}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-right align-top tabular-nums">
                      {units(item.quantity, item)}
                    </td>
                    <td className="px-2 py-2 text-right align-top tabular-nums">
                      {units(item.receivedQuantity, item)}
                    </td>
                    <td className="px-2 py-2 text-right align-top font-semibold tabular-nums">
                      {units(remaining(item), item)}
                      {item.unit === 'box' && (
                        <p className="text-xs font-normal text-slate-500">
                          = {remaining(item) * item.piecesPerUnit} pcs
                        </p>
                      )}
                    </td>
                    {cell(
                      item.id,
                      'receivedQuantity',
                      <input
                        type="number"
                        min="0"
                        max={remaining(item)}
                        step="1"
                        inputMode="numeric"
                        className="field mt-0"
                        aria-label={`Quantity received now for ${item.productName}`}
                        aria-invalid={errors[`${item.id}.receivedQuantity`] ? true : undefined}
                        value={line.receivedQuantity}
                        onChange={(event) =>
                          updateLine(item.id, 'receivedQuantity', event.target.value)
                        }
                      />
                    )}
                    {cell(
                      item.id,
                      'batchNumber',
                      <>
                        <input
                          className="field mt-0"
                          autoComplete="off"
                          maxLength={80}
                          placeholder="Type or pick"
                          list={`batches-${item.id}`}
                          aria-label={`Batch number for ${item.productName}`}
                          aria-invalid={errors[`${item.id}.batchNumber`] ? true : undefined}
                          value={line.batchNumber}
                          onChange={(event) =>
                            chooseBatch(item, filterInput('reference', event.target.value).value)
                          }
                        />
                        <datalist id={`batches-${item.id}`}>
                          {existingBatches(item).map((batch) => (
                            <option key={batch.id} value={batch.batchNumber}>
                              Expires {batch.expiresAt.slice(0, 10)} · {batch.stock} in stock
                            </option>
                          ))}
                        </datalist>
                      </>
                    )}
                    {cell(
                      item.id,
                      'expiresAt',
                      <input
                        type="date"
                        className="field mt-0"
                        min={deliveredAt}
                        aria-label={`Expiry date for ${item.productName}`}
                        aria-invalid={errors[`${item.id}.expiresAt`] ? true : undefined}
                        value={line.expiresAt}
                        onChange={(event) => updateLine(item.id, 'expiresAt', event.target.value)}
                      />,
                      line.expiresAt &&
                        !errors[`${item.id}.expiresAt`] &&
                        getExpiryStatus(line.expiresAt) === 'near-expiry'
                        ? `Near expiry: within ${EXPIRY_WARNING_DAYS} days. Check before accepting.`
                        : undefined
                    )}
                    {cell(
                      item.id,
                      'sellPrice',
                      <input
                        type="number"
                        min={item.unitCost / item.piecesPerUnit}
                        step="0.01"
                        inputMode="decimal"
                        className="field mt-0"
                        aria-label={`Selling price for ${item.productName}`}
                        aria-invalid={errors[`${item.id}.sellPrice`] ? true : undefined}
                        value={line.sellPrice}
                        onChange={(event) => updateLine(item.id, 'sellPrice', event.target.value)}
                      />
                    )}
                    {cell(
                      item.id,
                      'boxSellPrice',
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="field mt-0"
                        disabled={piecesPerBox <= 1}
                        placeholder={
                          piecesPerBox <= 1
                            ? 'Piece only'
                            : line.sellPrice
                              ? (Number(line.sellPrice) * piecesPerBox).toFixed(2)
                              : 'Optional'
                        }
                        aria-label={`Box selling price for ${item.productName}`}
                        aria-invalid={errors[`${item.id}.boxSellPrice`] ? true : undefined}
                        value={line.boxSellPrice}
                        onChange={(event) =>
                          updateLine(item.id, 'boxSellPrice', event.target.value)
                        }
                      />
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Set “Received now” to 0 for products that did not arrive; they stay open for a later
          delivery. Batch number, expiry date and price per piece are required for every product you
          receive. Boxes received are added to stock as pieces. Leave the box price empty to sell a
          box at the piece price × pieces per box. Picking an existing batch of this product fills
          in its expiry date and price; stock is added to that batch only when product, supplier,
          cost, price and expiry match.
        </p>
        <FormError message={error} />
        <DialogActions close={close} saving={saving} label="Receive Products" />
      </form>
    </Modal>
  )
}

function DialogActions({
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

function Metric({
  label,
  value,
  icon
}: {
  label: string
  value: number | string
  icon: ReactElement
}): ReactElement {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <span className="bg-brand-50 text-brand-700 grid size-10 place-items-center rounded-lg">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
