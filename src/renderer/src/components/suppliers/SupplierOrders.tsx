import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import ProcurementRecords from '@renderer/components/suppliers/ProcurementRecords'
import type { ItemProfile } from '@renderer/data/profiles'
import type {
  DeliveryFormValues,
  OrderStatus,
  PurchaseOrderFormValues,
  SupplierFormValues
} from '@renderer/data/supplierOrders'
import {
  orderStatusLabels,
  orderStatusTone,
  type PurchaseOrderRecord
} from '@renderer/data/supplierOrders'
import { useSupplierOrders } from '@renderer/hooks/useSupplierOrders'
import type { Supplier } from '@shared/types'
import { useMemo, useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import {
  FiArchive,
  FiCheck,
  FiEdit2,
  FiFileText,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiTruck,
  FiX
} from 'react-icons/fi'

type Tab = 'suppliers' | 'orders' | 'receiving' | 'invoices' | 'history'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })
const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ['draft', 'submitted', 'cancelled'],
  submitted: ['submitted', 'cancelled'],
  partially_received: ['partially_received', 'cancelled'],
  received: ['received'],
  cancelled: ['cancelled']
}

const today = (): string => {
  const current = new Date()
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
}

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

export default function SupplierOrders(): ReactElement {
  const procurement = useSupplierOrders()
  const [tab, setTab] = useState<Tab>('suppliers')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [supplierDialog, setSupplierDialog] = useState<Supplier | 'new' | null>(null)
  const [orderDialog, setOrderDialog] = useState(false)
  const [receiveDialog, setReceiveDialog] = useState<PurchaseOrderRecord | null>(null)
  const [feedback, setFeedback] = useState('')

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

  const saveSupplier = async (values: SupplierFormValues, id?: number): Promise<void> => {
    await procurement.saveSupplier(values, id)
    setSupplierDialog(null)
    setFeedback(id ? 'Supplier updated.' : 'Supplier added.')
  }

  const removeSupplier = async (supplier: Supplier): Promise<void> => {
    if (!window.confirm(`Remove ${supplier.organization}?`)) return
    try {
      await procurement.deleteSupplier(supplier.id)
      setFeedback('Supplier removed.')
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Unable to remove the supplier.')
    }
  }

  const updateOrderStatus = async (
    order: PurchaseOrderRecord,
    nextStatus: OrderStatus
  ): Promise<void> => {
    try {
      await procurement.updateOrderStatus(order.id, nextStatus)
      setFeedback(`${order.orderNumber} marked ${orderStatusLabels[nextStatus].toLowerCase()}.`)
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Unable to update the order.')
    }
  }

  const removeOrder = async (order: PurchaseOrderRecord): Promise<void> => {
    if (!window.confirm(`Delete ${order.orderNumber}?`)) return
    try {
      await procurement.deleteOrder(order.id)
      setFeedback('Purchase order deleted.')
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Unable to delete the order.')
    }
  }

  return (
    <DashboardShell pageTitle="Suppliers & orders">
      <div className="space-y-5 lg:space-y-6">
        <section className="page-intro p-6 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 right-0 size-64 rounded-full bg-mauve-400/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-1/4 -bottom-24 size-52 rounded-full bg-indigo-400/15 blur-3xl"
          />
          <div className="page-intro-content flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Supplier & procurement</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-[2rem]">
                Suppliers & orders
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                Maintain supplier records, create purchase orders, and record deliveries from one
                live workspace.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <p className="rounded-full border border-white/80 bg-white/55 px-3 py-1.5 text-xs font-medium text-neutral-500 shadow-sm backdrop-blur-md">
                Live procurement workspace
              </p>
              {(tab === 'suppliers' || tab === 'orders') && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    tab === 'suppliers' ? setSupplierDialog('new') : setOrderDialog(true)
                  }
                >
                  <FiPlus aria-hidden="true" />{' '}
                  {tab === 'suppliers' ? 'Add supplier' : 'Create order'}
                </button>
              )}
            </div>
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Suppliers" value={procurement.suppliers.length} icon={<FiTruck />} />
          <Metric
            label="Open orders"
            value={
              procurement.orders.filter(
                (order) => !['received', 'cancelled'].includes(order.status)
              ).length
            }
            icon={<FiFileText />}
          />
          <Metric
            label="Order value"
            value={currency.format(
              procurement.orders.reduce((total, order) => total + order.totalAmount, 0)
            )}
            icon={<FiArchive />}
          />
        </section>
        {(procurement.error || feedback) && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm text-neutral-700 shadow-sm backdrop-blur-md">
            <p
              className={procurement.error ? 'text-rose-700' : 'text-emerald-700'}
              role={procurement.error ? 'alert' : 'status'}
            >
              {procurement.error || feedback}
            </p>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setFeedback('')}
            >
              <FiX />
            </button>
          </div>
        )}
        <section className="table-surface">
          <div className="surface-header flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="flex w-full overflow-x-auto rounded-2xl border border-neutral-200/80 bg-white p-1 shadow-sm lg:w-auto"
              role="tablist"
              aria-label="Procurement views"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'suppliers'}
                onClick={() => {
                  setTab('suppliers')
                  setQuery('')
                  setStatus('all')
                }}
                className={`flex-1 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${tab === 'suppliers' ? 'bg-plum-900 shadow-plum-950/15 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'}`}
              >
                Suppliers
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'orders'}
                onClick={() => {
                  setTab('orders')
                  setQuery('')
                  setStatus('all')
                }}
                className={`flex-1 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${tab === 'orders' ? 'bg-plum-900 shadow-plum-950/15 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'}`}
              >
                Purchase orders
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'receiving'}
                onClick={() => {
                  setTab('receiving')
                  setQuery('')
                  setStatus('all')
                }}
                className={`flex-1 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${tab === 'receiving' ? 'bg-plum-900 shadow-plum-950/15 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'}`}
              >
                Receiving reports
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'invoices'}
                onClick={() => {
                  setTab('invoices')
                  setQuery('')
                  setStatus('all')
                }}
                className={`flex-1 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${tab === 'invoices' ? 'bg-plum-900 shadow-plum-950/15 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'}`}
              >
                Invoices
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'history'}
                onClick={() => {
                  setTab('history')
                  setQuery('')
                  setStatus('all')
                }}
                className={`flex-1 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition sm:flex-none ${tab === 'history' ? 'bg-plum-900 shadow-plum-950/15 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'}`}
              >
                History
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <label className="relative min-w-0 sm:w-72">
                <span className="sr-only">Search {tab}</span>
                <FiSearch className="absolute top-3 left-3.5 text-neutral-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="field mt-0 pl-10"
                  placeholder={
                    tab === 'suppliers'
                      ? 'Search suppliers'
                      : tab === 'orders'
                        ? 'Search order number or supplier'
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
              remove={removeSupplier}
              edit={setSupplierDialog}
              isLoading={procurement.isLoading}
            />
          ) : tab === 'orders' ? (
            <OrderTable
              orders={filteredOrders}
              isLoading={procurement.isLoading}
              updateStatus={(order, nextStatus) => void updateOrderStatus(order, nextStatus)}
              receive={setReceiveDialog}
              remove={(order) => void removeOrder(order)}
            />
          ) : (
            <ProcurementRecords
              view={tab}
              query={query}
              procurement={procurement}
              feedback={setFeedback}
            />
          )}
        </section>
      </div>
      {supplierDialog && (
        <SupplierDialog
          initial={supplierDialog === 'new' ? null : supplierDialog}
          close={() => setSupplierDialog(null)}
          save={saveSupplier}
        />
      )}
      {orderDialog && (
        <OrderDialog
          suppliers={procurement.suppliers}
          products={procurement.products}
          close={() => setOrderDialog(false)}
          save={async (values) => {
            await procurement.createOrder(values)
            setOrderDialog(false)
            setFeedback('Purchase order created.')
          }}
        />
      )}
      {receiveDialog && (
        <ReceiveDialog
          order={receiveDialog}
          close={() => setReceiveDialog(null)}
          save={async (items) => {
            await procurement.receiveOrder(receiveDialog.id, items)
            setReceiveDialog(null)
            setFeedback('Delivery recorded.')
          }}
        />
      )}
    </DashboardShell>
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
  remove: (supplier: Supplier) => Promise<void>
}): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="surface-header text-left text-neutral-500">
          <tr>
            <th className="px-5 py-3">Supplier</th>
            <th className="px-5 py-3">Contact</th>
            <th className="px-5 py-3">Location</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100/90">
          {suppliers.map((supplier) => (
            <tr
              key={supplier.id}
              tabIndex={0}
              role="button"
              aria-label={`View ${supplier.organization}`}
              onClick={() => edit(supplier)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  edit(supplier)
                }
              }}
              className="cursor-pointer transition-colors hover:bg-mauve-50/50 focus-visible:bg-mauve-50/50 focus-visible:ring-2 focus-visible:ring-mauve-500 focus-visible:outline-none focus-visible:ring-inset"
            >
              <td className="px-5 py-4">
                <p className="font-semibold text-neutral-900">{supplier.organization}</p>
                <p className="text-xs text-neutral-500">{supplier.person}</p>
              </td>
              <td className="px-5 py-4">
                <p>{supplier.phone}</p>
                <p className="text-xs text-neutral-500">
                  {supplier.email || supplier.telephone || 'No secondary contact'}
                </p>
              </td>
              <td className="px-5 py-4 text-neutral-600">
                {supplier.city}, {supplier.province}
              </td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${supplier.organization}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      edit(supplier)
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    type="button"
                    className="icon-button text-rose-700"
                    aria-label={`Remove ${supplier.organization}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void remove(supplier)
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
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
        <EmptyState label="No suppliers match this search." />
      )}
      {isLoading && <EmptyState label="Loading suppliers…" />}
    </div>
  )
}

function OrderTable({
  orders,
  isLoading,
  updateStatus,
  receive,
  remove
}: {
  orders: PurchaseOrderRecord[]
  isLoading: boolean
  updateStatus: (order: PurchaseOrderRecord, status: OrderStatus) => void
  receive: (order: PurchaseOrderRecord) => void
  remove: (order: PurchaseOrderRecord) => void
}): ReactElement {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[17%]" />
          <col className="w-[17%]" />
          <col className="w-[31%]" />
          <col className="hidden w-[15%] xl:table-column" />
          <col className="w-24" />
        </colgroup>
        <thead className="surface-header text-left text-neutral-500">
          <tr>
            <th className="px-5 py-3">Order</th>
            <th className="px-5 py-3">Supplier</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Items</th>
            <th className="hidden px-3 py-3 xl:table-cell">Total</th>
            <th className="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100/90">
          {orders.map((order) => {
            const canReceive =
              ['submitted', 'partially_received'].includes(order.status) &&
              order.items.some((item) => item.receivedQuantity < item.quantity)
            return (
              <tr key={order.id} className="transition-colors hover:bg-mauve-50/50">
                <td className="min-w-0 px-3 py-4 align-top">
                  <p className="truncate font-semibold text-neutral-900" title={order.orderNumber}>
                    {order.orderNumber}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Ordered {date.format(new Date(order.orderedAt))}
                  </p>
                  {order.expectedAt && (
                    <p className="text-xs text-neutral-500">
                      Expected {date.format(new Date(order.expectedAt))}
                    </p>
                  )}
                  <p className="mt-1 text-xs font-semibold xl:hidden">
                    {currency.format(order.totalAmount)}
                  </p>
                </td>
                <td className="min-w-0 px-3 py-4 align-top">
                  <p className="truncate" title={order.supplierName}>
                    {order.supplierName}
                  </p>
                </td>
                <td className="px-3 py-4 align-top">
                  <select
                    value={order.status}
                    onChange={(event) => updateStatus(order, event.target.value as OrderStatus)}
                    className={`rounded-full border border-white/80 px-2.5 py-1 text-xs font-semibold shadow-sm ${orderStatusTone[order.status]}`}
                    aria-label={`Status for ${order.orderNumber}`}
                  >
                    {orderStatusTransitions[order.status].map((status) => (
                      <option key={status} value={status}>
                        {orderStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="min-w-0 px-3 py-4 text-neutral-600">
                  <ul className="space-y-1">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span
                          className="block truncate font-medium text-neutral-800"
                          title={item.productName}
                        >
                          {item.productName}
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {item.quantity} ordered · {item.receivedQuantity} received
                        </span>
                      </li>
                    ))}
                  </ul>
                  {order.notes && (
                    <p
                      className="mt-2 line-clamp-2 text-xs break-words text-neutral-500"
                      title={order.notes}
                    >
                      {order.notes}
                    </p>
                  )}
                </td>
                <td className="hidden px-3 py-4 font-semibold xl:table-cell">
                  {currency.format(order.totalAmount)}
                </td>
                <td className="px-3 py-4 align-top">
                  <div className="flex flex-col items-stretch gap-2">
                    {canReceive && (
                      <button
                        type="button"
                        className="secondary-button justify-center px-2 text-xs"
                        onClick={() => receive(order)}
                      >
                        <FiCheck /> Receive
                      </button>
                    )}
                    {['draft', 'cancelled'].includes(order.status) && (
                      <button
                        type="button"
                        className="icon-button text-rose-700"
                        aria-label={`Delete ${order.orderNumber}`}
                        onClick={() => remove(order)}
                      >
                        <FiTrash2 />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!isLoading && orders.length === 0 && (
        <EmptyState label="No purchase orders match these filters." />
      )}
      {isLoading && <EmptyState label="Loading purchase orders…" />}
    </div>
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
  const [error, setError] = useState('')
  const set = (key: keyof SupplierFormValues, value: string): void =>
    setValues((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await save(
        { ...values, telephone: values.telephone || null, email: values.email || null },
        initial?.id
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the supplier.')
      setSaving(false)
    }
  }
  return (
    <Dialog title={initial ? 'Edit supplier' : 'Add supplier'} close={close}>
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization">
            <input
              required
              className="field"
              placeholder={'e.g. MedSupply Distribution'}
              value={values.organization}
              onChange={(event) => set('organization', event.target.value)}
            />
          </Field>
          <Field label="Contact person">
            <input
              required
              className="field"
              placeholder={'e.g. Juan Dela Cruz'}
              value={values.person}
              onChange={(event) => set('person', event.target.value)}
            />
          </Field>
          <Field label="Mobile phone">
            <input
              required
              className="field"
              inputMode={'numeric'}
              maxLength={11}
              placeholder={'e.g. 09171234567'}
              value={values.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className="field"
              placeholder={'e.g. juan@example.com'}
              value={values.email ?? ''}
              onChange={(event) => set('email', event.target.value)}
            />
          </Field>
          <Field label="Street">
            <input
              required
              className="field"
              placeholder={'e.g. 123 Rizal Street'}
              value={values.street}
              onChange={(event) => set('street', event.target.value)}
            />
          </Field>
          <Field label="City">
            <input
              required
              className="field"
              placeholder={'e.g. Davao City'}
              value={values.city}
              onChange={(event) => set('city', event.target.value)}
            />
          </Field>
          <Field label="Province">
            <input
              required
              className="field"
              placeholder={'e.g. Davao del Sur'}
              value={values.province}
              onChange={(event) => set('province', event.target.value)}
            />
          </Field>
          <Field label="Postal code">
            <input
              required
              className="field"
              placeholder={'e.g. 8000'}
              value={values.postalCode}
              onChange={(event) => set('postalCode', event.target.value)}
            />
          </Field>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200/80 bg-rose-50/75 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button disabled={saving} className="primary-button">
            {saving ? 'Saving…' : 'Save supplier'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function OrderDialog({
  suppliers,
  products,
  close,
  save
}: {
  suppliers: Supplier[]
  products: ItemProfile[]
  close: VoidFunction
  save: (values: PurchaseOrderFormValues) => Promise<void>
}): ReactElement {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? 0)
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Array<{ drugId: string; quantity: string; unitCost: string }>>(
    [{ drugId: String(products[0]?.id ?? ''), quantity: '1', unitCost: '0' }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const items = lines.map((line) => ({
      drugId: Number(line.drugId),
      quantity: Number(line.quantity),
      unitCost: Number(line.unitCost)
    }))
    try {
      await save({ supplierId, expectedAt: expectedAt || null, notes: notes || null, items })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the purchase order.')
      setSaving(false)
    }
  }
  return (
    <Dialog title="Create purchase order" close={close}>
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <Field label="Supplier">
          <select
            required
            className="field"
            value={supplierId}
            onChange={(event) => setSupplierId(Number(event.target.value))}
          >
            <option value={0}>Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.organization}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expected delivery">
          <input
            type="date"
            className="field"
            value={expectedAt}
            onChange={(event) => setExpectedAt(event.target.value)}
          />
        </Field>
        <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/55 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-700">Order lines</p>
            <button
              type="button"
              className="secondary-button text-xs"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { drugId: String(products[0]?.id ?? ''), quantity: '1', unitCost: '0' }
                ])
              }
              disabled={products.length === 0}
            >
              <FiPlus /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div
                key={`${index}-${line.drugId}`}
                className="grid gap-2 rounded-2xl border border-neutral-200/70 bg-white/80 p-2 sm:grid-cols-[1fr_6rem_7rem_auto]"
              >
                <select
                  required
                  className="field mt-0"
                  value={line.drugId}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, drugId: event.target.value } : item
                      )
                    )
                  }
                >
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.brandName} · {product.genericName}
                    </option>
                  ))}
                </select>
                <input
                  required
                  min="1"
                  type="number"
                  className="field mt-0"
                  aria-label="Quantity"
                  placeholder={'e.g. 10'}
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, quantity: event.target.value } : item
                      )
                    )
                  }
                />
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  className="field mt-0"
                  aria-label="Unit cost"
                  placeholder={'e.g. 25.50'}
                  value={line.unitCost}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, unitCost: event.target.value } : item
                      )
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove order line"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <FiX />
                </button>
              </div>
            ))}
          </div>
        </div>
        <Field label="Notes">
          <textarea
            className="field min-h-20"
            placeholder={'e.g. Deliver before month end'}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200/80 bg-rose-50/75 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button
            disabled={saving || suppliers.length === 0 || products.length === 0}
            className="primary-button"
          >
            {saving ? 'Creating…' : 'Create order'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function ReceiveDialog({
  order,
  close,
  save
}: {
  order: PurchaseOrderRecord
  close: VoidFunction
  save: (values: DeliveryFormValues) => Promise<void>
}): ReactElement {
  const [deliveredAt, setDeliveredAt] = useState(today())
  const [requestId] = useState(() => crypto.randomUUID())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<
    Record<
      number,
      { receivedQuantity: string; batchNumber: string; sellPrice: string; expiresAt: string }
    >
  >(() =>
    Object.fromEntries(
      order.items.map((item) => [
        item.id,
        {
          receivedQuantity: String(Math.max(item.quantity - item.receivedQuantity, 0)),
          batchNumber: '',
          sellPrice: String(item.unitCost),
          expiresAt: ''
        }
      ])
    )
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const deliveries = Object.entries(lines)
      .map(([itemId, value]) => ({
        itemId: Number(itemId),
        receivedQuantity: Number(value.receivedQuantity),
        batchNumber: value.batchNumber.trim(),
        sellPrice: Number(value.sellPrice),
        expiresAt: value.expiresAt
      }))
      .filter((item) => item.receivedQuantity > 0)
    if (deliveries.length === 0) {
      setError('Enter at least one delivered quantity.')
      setSaving(false)
      return
    }
    if (
      deliveries.some(
        (item) => !item.batchNumber || !item.expiresAt || Number.isNaN(item.sellPrice)
      )
    ) {
      setError('Enter a batch number, selling price, and expiry date for each delivered line.')
      setSaving(false)
      return
    }
    try {
      await save({ requestId, deliveredAt, notes: notes.trim() || null, items: deliveries })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record the delivery.')
      setSaving(false)
    }
  }
  return (
    <Dialog title={`Receive ${order.orderNumber}`} close={close}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <p className="text-sm leading-6 text-neutral-600">
          Record the delivered units and stock batch details. Inventory and the order status update
          together when this delivery is saved.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery date">
            <input
              required
              type="date"
              className="field"
              value={deliveredAt}
              onChange={(event) => setDeliveredAt(event.target.value)}
            />
          </Field>
          <Field label="Delivery notes">
            <input
              className="field"
              value={notes}
              placeholder="Optional reference or remarks"
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
        <div className="space-y-3">
          {order.items.map((item) => {
            const line = lines[item.id]
            const updateLine = (field: keyof typeof line, value: string): void =>
              setLines((current) => ({
                ...current,
                [item.id]: { ...current[item.id], [field]: value }
              }))
            return (
              <section
                key={item.id}
                className="rounded-2xl border border-neutral-200/80 bg-white/70 p-3 text-sm"
              >
                <div>
                  <span className="block font-medium text-neutral-800">{item.productName}</span>
                  <span className="text-xs text-neutral-500">
                    {item.receivedQuantity} of {item.quantity} already received
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Field label="Delivered quantity">
                    <input
                      required
                      min="0"
                      max={item.quantity - item.receivedQuantity}
                      type="number"
                      className="field"
                      value={line?.receivedQuantity ?? '0'}
                      onChange={(event) => updateLine('receivedQuantity', event.target.value)}
                    />
                  </Field>
                  <Field label="Batch number">
                    <input
                      required={Number(line?.receivedQuantity) > 0}
                      className="field"
                      value={line?.batchNumber ?? ''}
                      onChange={(event) => updateLine('batchNumber', event.target.value)}
                    />
                  </Field>
                  <Field label="Selling price">
                    <input
                      required={Number(line?.receivedQuantity) > 0}
                      min="0"
                      step="0.01"
                      type="number"
                      className="field"
                      value={line?.sellPrice ?? ''}
                      onChange={(event) => updateLine('sellPrice', event.target.value)}
                    />
                  </Field>
                  <Field label="Expiry date">
                    <input
                      required={Number(line?.receivedQuantity) > 0}
                      min={deliveredAt}
                      type="date"
                      className="field"
                      value={line?.expiresAt ?? ''}
                      onChange={(event) => updateLine('expiresAt', event.target.value)}
                    />
                  </Field>
                </div>
              </section>
            )
          })}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200/80 bg-rose-50/75 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button disabled={saving} className="primary-button">
            {saving ? 'Saving…' : 'Record delivery'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function Dialog({
  title,
  close,
  children
}: {
  title: string
  close: VoidFunction
  children: ReactNode
}): ReactElement {
  return (
    <div className="bg-ink-950/55 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-md">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close dialog"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        className="glass-surface relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border-white/80 p-5 sm:p-6"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 right-0 size-44 rounded-full bg-mauve-300/30 blur-3xl"
        />
        <div className="relative mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-950">{title}</h2>
          <button type="button" onClick={close} className="icon-button" aria-label="Close dialog">
            <FiX />
          </button>
        </div>
        <div className="relative">{children}</div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

function EmptyState({ label }: { label: string }): ReactElement {
  return (
    <p className="grid min-h-52 place-items-center p-10 text-center text-sm text-neutral-500">
      {label}
    </p>
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
    <div className="relative overflow-hidden rounded-[1.5rem] border border-neutral-200/80 bg-white/85 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div
        aria-hidden="true"
        className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-mauve-300/0 via-mauve-300/90 to-indigo-300/0"
      />
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{label}</p>
        <span className="grid size-10 place-items-center rounded-2xl bg-mauve-50 text-mauve-700">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
