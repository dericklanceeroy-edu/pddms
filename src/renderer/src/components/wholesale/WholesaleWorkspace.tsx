import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { useConfirm } from '@renderer/components/ui/ConfirmDialog'
import FilteredInput from '@renderer/components/ui/FilteredInput'
import { RequiredNote } from '@renderer/components/ui/FormField'
import InfoTip from '@renderer/components/ui/InfoTip'
import Modal from '@renderer/components/ui/Modal'
import type { FieldErrors } from '@renderer/components/ui/fieldErrors'
import DeliveryReceiptSlip from '@renderer/components/wholesale/DeliveryReceipt'
import type { CustomerProfile, ItemProfile } from '@renderer/data/profiles'
import { useAccount } from '@renderer/hooks/useAccount'
import { getCustomers, getProducts } from '@renderer/services/profiles'
import {
  cancelWholesale,
  createWholesale,
  deliverWholesale,
  exportDeliveryReceipt,
  getWholesale,
  listWholesale,
  payWholesale,
  reservedWholesale,
  scheduleWholesale,
  wholesaleAlerts
} from '@renderer/services/wholesale'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { getExpiryStatus, isBatchSellable, localDate } from '@shared/inventory'
import { calculateSale, money, priceToCents, type CartLine } from '@shared/sales'
import { paymentMethodLabel, paymentMethods } from '@shared/schemas'
import { availableUnits, quantityLabel, unitWord, wholesaleBoxPrice } from '@shared/units'
import { FieldValidationError } from '@shared/validation'
import {
  orderStatuses,
  type WholesaleDetails,
  type WholesaleFilter,
  type WholesaleSummary
} from '@shared/wholesale'
import { Link } from '@tanstack/react-router'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronRight,
  FiPlus,
  FiSearch,
  FiTrash2
} from 'react-icons/fi'

/** Wholesale lines are always whole boxes. */
type BoxLine = CartLine & { unit: 'box' }

const statusLabels: Record<string, string> = {
  pending: 'Not Scheduled',
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
}
const statusTone: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800',
  scheduled: 'bg-sky-50 text-sky-800',
  delivered: 'bg-emerald-50 text-emerald-800',
  cancelled: 'bg-slate-100 text-slate-700'
}
const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
/** Dates read the same as elsewhere in the app, e.g. "Nov 15, 2026". */
const showDate = (value: string | null | undefined): string => {
  if (!value) return ''
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}
const showDateTime = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date)
}
const paymentLabels: Record<string, string> = {
  paid: 'Paid',
  partially_paid: 'Partially Paid',
  outstanding: 'Outstanding'
}

export default function WholesaleWorkspace(): ReactElement {
  const [confirmDialog, confirm] = useConfirm()
  const { account } = useAccount()
  const admin = account?.role === 'master'
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [clients, setClients] = useState<CustomerProfile[]>([])
  const [orders, setOrders] = useState<WholesaleSummary[]>([])
  const [selected, setSelected] = useState<WholesaleDetails | null>(null)
  const [alerts, setAlerts] = useState({ count: 0, remainingCents: 0 })
  const [filter, setFilter] = useState<WholesaleFilter>({})
  const [search, setSearch] = useState('')
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const working = useRef(false)
  const selectedId = useRef<number | null>(null)
  const fail = (cause: unknown): void =>
    setError(cause instanceof Error ? cause.message : 'Unable to load wholesale data.')
  const applyCatalog = useCallback(
    ([items, people]: [
      Awaited<ReturnType<typeof getProducts>>,
      Awaited<ReturnType<typeof getCustomers>>
    ]): void => {
      setProducts(items)
      // Note: Wholesale clients are other pharmacies, never retail (counter) customers.
      setClients(people.filter((person) => person.clientType === 'pharmacy'))
    },
    []
  )
  const loadCatalog = useCallback(async (): Promise<void> => {
    applyCatalog(await Promise.all([getProducts(), getCustomers()]))
  }, [applyCatalog])
  const fetchOrders = useCallback(
    () => Promise.all([listWholesale(filter), admin ? wholesaleAlerts() : Promise.resolve(null)]),
    [filter, admin]
  )
  const applyOrders = useCallback(
    ([records, summary]: Awaited<ReturnType<typeof fetchOrders>>): void => {
      setOrders(records)
      setMore(records.length === 50)
      if (summary) setAlerts(summary)
    },
    []
  )
  const reload = useCallback(async (): Promise<void> => {
    applyOrders(await fetchOrders())
  }, [fetchOrders, applyOrders])
  useEffect(() => {
    let active = true
    void Promise.all([getProducts(), getCustomers()])
      .then((data) => {
        if (active) applyCatalog(data)
      })
      .catch((cause) => {
        if (active) fail(cause)
      })
    return () => {
      active = false
    }
  }, [applyCatalog])
  useEffect(() => {
    let active = true
    void fetchOrders()
      .then((data) => {
        if (active) applyOrders(data)
      })
      .catch((cause) => {
        if (active) fail(cause)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchOrders, applyOrders])
  // Note: The order list follows the client/reference box as the user types (no Search button).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilter((current) =>
        (current.search ?? '') === search.trim()
          ? current
          : { ...current, search: search.trim(), beforeId: undefined }
      )
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => {
    const refresh = (): void => {
      if (working.current) return
      void reload()
        .then(async () => {
          const id = selectedId.current
          if (id) {
            const order = await getWholesale(id)
            if (selectedId.current === id) setSelected(order)
          }
        })
        .catch(fail)
    }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      fail(cause)
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  const open = (order: WholesaleDetails): void => {
    selectedId.current = order.id
    setSelected(order)
  }
  const closeDetails = (): void => {
    selectedId.current = null
    setSelected(null)
  }
  return (
    <DashboardShell pageTitle="Wholesale & Deliveries">
      <div className="space-y-5">
        <header className="page-intro flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Business</p>
            <div className="flex items-center gap-1.5">
              <h1 className="page-title mt-0.5">Wholesale &amp; Deliveries</h1>
              <InfoTip label="Wholesale & Deliveries">
                Orders from pharmacy clients, sold by the box, with their delivery schedule and the
                balances they owe.
              </InfoTip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await reload()
                  await loadCatalog()
                  if (selectedId.current) open(await getWholesale(selectedId.current))
                })
              }
            >
              Refresh
            </button>
            <Link
              to="/wholesale/clients/$clientId"
              params={{ clientId: 'new' }}
              className="secondary-button"
            >
              <FiPlus aria-hidden="true" /> Add Pharmacy Client
            </Link>
            <button className="primary-button" disabled={busy} onClick={() => setCreating(true)}>
              <FiPlus aria-hidden="true" /> New Wholesale Order
            </button>
          </div>
        </header>
        {error && !selected && !creating && (
          <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        {notice && !selected && (
          <p
            role="status"
            className="status-message border-emerald-200 bg-emerald-50 text-emerald-800"
          >
            {notice}
          </p>
        )}
        {admin && (
          <div
            role="status"
            className={`status-message flex flex-wrap items-center gap-3 font-medium ${alerts.count ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
          >
            {alerts.count
              ? `Warning: ${alerts.count} overdue account${alerts.count === 1 ? '' : 's'} · ${money(alerts.remainingCents)} outstanding`
              : 'No overdue wholesale accounts.'}
            {alerts.count > 0 && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setSearch('')
                  setFilter({ overdue: true })
                }}
              >
                Review Overdue
              </button>
            )}
          </div>
        )}
        <section className="panel space-y-4 p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="section-title">Orders &amp; Delivery Schedule</h3>
              <InfoTip label="Orders & Delivery Schedule">
                The list updates as you type. Select View to open an order’s details.
              </InfoTip>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="field-label min-w-0 flex-1">
              Client or Reference
              <span className="relative mt-1.5 block font-normal">
                <FiSearch
                  aria-hidden="true"
                  className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="field pl-10"
                  maxLength={100}
                  value={search}
                  placeholder="Type a pharmacy name or order reference"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </span>
            </label>
            <label className="field-label">
              Status
              <select
                className="field mt-1.5 font-normal"
                value={filter.status ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    status: (event.target.value as WholesaleFilter['status']) || undefined
                  })
                }
              >
                <option value="">All Statuses</option>
                {orderStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            {admin && (
              <label className="flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={!!filter.overdue}
                  disabled={busy}
                  onChange={(event) => setFilter({ ...filter, overdue: event.target.checked })}
                />
                Overdue Only
              </label>
            )}
          </div>
          {loading && <p role="status">Loading orders…</p>}
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
            <table className="data-table w-full min-w-[850px] text-left text-sm">
              <thead className="sticky top-0">
                <tr>
                  {[
                    'Client / Reference',
                    'Order / Due Date',
                    'Delivery',
                    'Total',
                    ...(admin ? ['Paid / Remaining', 'Payment Status'] : []),
                    'Details'
                  ].map((label) => (
                    <th key={label} className="px-3 py-2.5">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="max-w-64 px-3 py-3 break-words">
                      <span className="font-semibold text-slate-900">{order.customerName}</span>
                      {order.reviewNote && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                          title={order.reviewNote}
                        >
                          <FiAlertTriangle aria-hidden="true" /> Retail Customer
                        </span>
                      )}
                      <p className="text-xs break-all text-slate-600">{order.reference}</p>
                    </td>
                    <td className="px-3 py-3">
                      {showDate(order.orderDate)}
                      <p className="text-xs text-slate-600">Due {showDate(order.dueDate)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={order.status} />
                      <p className="mt-1 text-xs text-slate-500">
                        {order.scheduledDate ? showDate(order.scheduledDate) : 'No delivery date'}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums">
                      {money(order.totalCents)}
                    </td>
                    {admin && (
                      <>
                        <td className="px-3 py-3 tabular-nums">
                          {order.receivable ? (
                            <>
                              {money(order.receivable.paidCents)} paid
                              <p className="text-xs text-slate-500">
                                {money(order.receivable.remainingCents)} remaining
                              </p>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {order.receivable && (
                            <span
                              className={`text-sm font-semibold ${order.receivable.deadlineStatus === 'overdue' ? 'text-rose-700' : order.receivable.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}
                            >
                              {paymentLabels[order.receivable.paymentStatus]}
                              <span className="block text-xs">
                                {order.receivable.deadlineStatus === 'overdue'
                                  ? 'Overdue'
                                  : order.receivable.deadlineStatus === 'paid'
                                    ? 'Settled'
                                    : 'Upcoming'}
                              </span>
                            </span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-3">
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void run(async () => open(await getWholesale(order.id)))}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !orders.length && (
            <p className="text-sm text-slate-500">No wholesale orders match these filters.</p>
          )}
          {more && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const rows = await listWholesale({ ...filter, beforeId: orders.at(-1)?.id })
                  setOrders([...orders, ...rows])
                  setMore(rows.length === 50)
                })
              }
            >
              Load Older Orders
            </button>
          )}
        </section>
        <PharmacyClients clients={clients} />
      </div>
      {creating && (
        <OrderForm
          clients={clients}
          products={products}
          close={() => setCreating(false)}
          saved={async (id) => {
            setCreating(false)
            await reload()
            setNotice(
              'Order saved and delivery scheduled. Stock is deducted when delivery is recorded.'
            )
            open(await getWholesale(id))
          }}
        />
      )}
      {selected && (
        <OrderDetails
          order={selected}
          admin={admin}
          busy={busy}
          error={error}
          notice={notice}
          confirm={confirm}
          close={closeDetails}
          act={(action, message) =>
            run(async () => {
              const override = await action()
              setNotice(typeof override === 'string' ? override : message)
              if (selectedId.current) open(await getWholesale(selectedId.current))
              await reload()
            })
          }
          deliveryRecorded={async () => {
            useProfileStore.getState().reset()
            await loadCatalog()
          }}
          setError={setError}
        />
      )}
      {confirmDialog}
    </DashboardShell>
  )
}

function StatusBadge({ status }: { status: string }): ReactElement {
  return <span className={`status-badge ${statusTone[status] ?? ''}`}>{statusLabels[status]}</span>
}

/** Turns schema problems into messages beside the fields of one form. */
function useFieldErrors(): {
  errors: FieldErrors
  capture: (cause: unknown) => never
  clear: VoidFunction
  error: (key: string) => ReactElement | null
} {
  const [errors, setErrors] = useState<FieldErrors>({})
  return {
    errors,
    clear: () => setErrors({}),
    capture: (cause: unknown) => {
      if (cause instanceof FieldValidationError) {
        const fields: FieldErrors = {}
        for (const issue of cause.issues) fields[issue.field || issue.path] ??= issue.message
        setErrors(fields)
        throw new Error('Check the highlighted fields.')
      }
      throw cause
    },
    error: (key: string) =>
      errors[key] ? <span className="field-error font-normal">{errors[key]}</span> : null
  }
}

function Label({
  text,
  required = false,
  className = '',
  children
}: {
  text: string
  required?: boolean
  className?: string
  children: ReactNode
}): ReactElement {
  return (
    <label className={`field-label ${className}`}>
      {text}
      {required ? (
        <span className="required-mark" aria-hidden="true">
          *
        </span>
      ) : (
        <span className="ml-1 text-xs font-normal text-slate-600">(optional)</span>
      )}
      <span className="mt-1.5 block font-normal">{children}</span>
    </label>
  )
}

/**
 * New wholesale order in one workflow: pharmacy client, delivery schedule and payment terms
 * first, then products by the box.
 */
function OrderForm({
  clients,
  products,
  close,
  saved
}: {
  clients: CustomerProfile[]
  products: ItemProfile[]
  close: VoidFunction
  saved: (id: number) => Promise<void>
}): ReactElement {
  const [customerId, setCustomerId] = useState('')
  const [address, setAddress] = useState('')
  const [scheduledDate, setScheduledDate] = useState(localDate())
  const [dueDate, setDueDate] = useState(localDate())
  const [driverName, setDriverName] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<BoxLine[]>([])
  const [query, setQuery] = useState('')
  const [boxes, setBoxes] = useState<Record<number, string>>({})
  const [lineError, setLineError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef<{ fingerprint: string; id: string } | null>(null)
  const fields = useFieldErrors()
  // Note: Stock leaves at delivery, so pieces already on other undelivered orders are promised.
  // The picker shows only the boxes still free, matching the check made when the order is saved.
  const [reserved, setReserved] = useState<Record<number, number>>({})
  useEffect(() => {
    let active = true
    reservedWholesale()
      .then((value) => active && setReserved(value))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  const batches = useMemo(
    () =>
      products.flatMap((product) =>
        product.batches.map((batch) => ({
          ...batch,
          product,
          // Note: Each batch keeps the box size it was delivered in (e.g. 50 or 100 pieces);
          // a batch received loose is sold as a box of 1.
          perBox: Math.max(1, batch.piecesPerBox),
          reserved: reserved[batch.id] ?? 0,
          free: Math.max(0, batch.stock - (reserved[batch.id] ?? 0))
        }))
      ),
    [products, reserved]
  )
  const matches = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    return products
      .filter((product) =>
        terms.every((term) =>
          `${product.brandName} ${product.genericName} ${product.formulation} ${product.category}`
            .toLowerCase()
            .includes(term)
        )
      )
      .map((product) => ({
        product,
        batches: batches.filter(
          (batch) =>
            batch.product.id === product.id && isBatchSellable(batch.stock, batch.expiresAt)
        )
      }))
      .filter((entry) => entry.batches.length)
      .slice(0, 30)
  }, [products, batches, query])
  let total = 0
  let totalError = ''
  try {
    total = calculateSale(lines, 'none').totalCents
  } catch (cause) {
    totalError = cause instanceof Error ? cause.message : 'Invalid total.'
  }
  /**
   * Soonest-expiring sellable batch of the same product and box size: sold first (FEFO). Boxes of
   * 50 and boxes of 100 are different packs, so each size has its own "sell first" batch.
   */
  const sellFirst = (batch: (typeof batches)[number]): (typeof batches)[number] | undefined =>
    batches.find(
      (value) =>
        value.product.id === batch.product.id &&
        value.perBox === batch.perBox &&
        isBatchSellable(value.stock, value.expiresAt) &&
        availableUnits(value.free, 'box', value.perBox) >= 1
    )
  const [confirmDialog, confirm] = useConfirm()
  const pick = async (batchId: number): Promise<void> => {
    const batch = batches.find((value) => value.id === batchId)
    const first = batch && sellFirst(batch)
    if (
      batch &&
      first &&
      first.id !== batch.id &&
      !lines.some((line) => line.batchId === batchId)
    ) {
      const accepted = await confirm({
        title: 'Use a later-expiring batch?',
        message: (
          <>
            Batch <strong>{first.batchNumber}</strong> (boxes of {first.perBox}) expires sooner,{' '}
            {showDate(first.expiresAt)}, and should be sold first. Use this later batch only if the
            client asked for a longer expiry.
          </>
        ),
        confirmLabel: 'Use This Batch'
      })
      if (!accepted) return
    }
    add(batchId)
  }
  const add = (batchId: number): void => {
    const batch = batches.find((value) => value.id === batchId)
    const quantity = Number(boxes[batchId] || '1')
    if (!batch || !isBatchSellable(batch.stock, batch.expiresAt)) {
      setLineError('This batch is no longer available. Refresh and pick another batch.')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setLineError('Enter a whole number of boxes greater than zero.')
      return
    }
    const existing = lines.find((line) => line.batchId === batchId)
    const next = quantity + (existing?.quantity ?? 0)
    const available = availableUnits(batch.free, 'box', batch.perBox)
    if (next > available) {
      setLineError(
        `Only ${available} full box${available === 1 ? '' : 'es'} of ${batch.product.brandName} (batch ${batch.batchNumber}) available${batch.reserved ? '; the rest is on other undelivered orders' : ''}.`
      )
      return
    }
    const line: BoxLine = {
      batchId,
      quantity: next,
      unit: 'box',
      unitPriceCents: priceToCents(
        wholesaleBoxPrice(
          batch.sellPrice,
          batch.boxSellPrice,
          batch.wholesaleBoxPrice,
          batch.perBox
        )
      )
    }
    setLines(
      existing ? lines.map((item) => (item.batchId === batchId ? line : item)) : [...lines, line]
    )
    setBoxes({ ...boxes, [batchId]: '' })
    setLineError('')
    fields.clear()
  }
  const submit = async (): Promise<void> => {
    setSaving(true)
    setError('')
    fields.clear()
    try {
      const values = {
        customerId: Number(customerId),
        dueDate,
        deliveryAddress: address,
        notes,
        scheduledDate,
        deliveryNotes,
        driverName,
        items: lines
      }
      const fingerprint = JSON.stringify(values)
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, id: crypto.randomUUID() }
      let id: number
      try {
        id = await createWholesale({ ...values, requestId: pending.current.id })
      } catch (cause) {
        fields.capture(cause)
      }
      pending.current = null
      await saved(id!)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the order.')
      setSaving(false)
    }
  }
  return (
    <Modal
      title="New Wholesale Order"
      info="Pick the pharmacy client and schedule the delivery, then add products by the box."
      close={close}
      size="lg"
      busy={saving}
    >
      <form
        noValidate
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <RequiredNote />
        <fieldset disabled={saving} className="space-y-4">
          <legend className="section-title text-lg">1. Client &amp; Delivery</legend>
          {clients.length === 0 && (
            <p className="status-message border-amber-300 bg-amber-50 text-amber-900">
              No pharmacy clients yet. Wholesale orders are for other pharmacies, not retail
              customers.{' '}
              <Link
                to="/wholesale/clients/$clientId"
                params={{ clientId: 'new' }}
                className="font-semibold underline"
              >
                Add a Pharmacy Client
              </Link>
              .
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Label text="Pharmacy Client" required>
              <select
                className="field"
                aria-invalid={fields.errors.customerId ? true : undefined}
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value)
                  setAddress(
                    clients.find((client) => client.id === Number(event.target.value))?.address ??
                      ''
                  )
                }}
              >
                <option value="">Select a pharmacy</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.fullName}
                    {client.address ? ` · ${client.address}` : ''}
                  </option>
                ))}
              </select>
              {fields.error('customerId')}
              {clients.length > 0 && (
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Not listed?{' '}
                  <Link
                    to="/wholesale/clients/$clientId"
                    params={{ clientId: 'new' }}
                    className="text-brand-700 font-semibold underline"
                  >
                    Add a Pharmacy Client
                  </Link>{' '}
                  first, then start the order.
                </span>
              )}
            </Label>
            <Label text="Delivery Address" required>
              <input
                maxLength={500}
                className="field"
                aria-invalid={fields.errors.deliveryAddress ? true : undefined}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
              {fields.error('deliveryAddress')}
            </Label>
            <Label text="Delivery Date" required>
              <input
                type="date"
                className="field"
                min={localDate()}
                aria-invalid={fields.errors.scheduledDate ? true : undefined}
                value={scheduledDate}
                onChange={(event) => {
                  setScheduledDate(event.target.value)
                  // Note: Payment cannot fall due before the delivery, so move the due date along.
                  if (event.target.value && dueDate < event.target.value)
                    setDueDate(event.target.value)
                }}
              />
              {fields.error('scheduledDate')}
            </Label>
            <Label text="Payment Due Date" required>
              <input
                type="date"
                className="field"
                min={scheduledDate || localDate()}
                aria-invalid={fields.errors.dueDate ? true : undefined}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              {fields.error('dueDate')}
            </Label>
            <Label text="Driver / Courier">
              <FilteredInput
                rule="personName"
                maxLength={120}
                placeholder="If already known"
                aria-invalid={fields.errors.driverName ? true : undefined}
                value={driverName}
                onValueChange={setDriverName}
              />
              {fields.error('driverName')}
            </Label>
            <Label text="Delivery Notes">
              <input
                maxLength={500}
                className="field"
                placeholder="e.g. Deliver before 10 AM"
                value={deliveryNotes}
                onChange={(event) => setDeliveryNotes(event.target.value)}
              />
            </Label>
            <Label text="Order Notes" className="md:col-span-2">
              <input
                maxLength={500}
                className="field"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Label>
          </div>
        </fieldset>
        <fieldset disabled={saving} className="space-y-3">
          <legend className="section-title flex items-center gap-1.5 text-lg">
            <span>
              2. Products (By the Box)
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <InfoTip label="Products">
              Search the catalog, enter the number of boxes, then select Add. Prices are per box of
              that batch. Batches are listed soonest expiry first; sell the one marked “Sell first”.
            </InfoTip>
          </legend>
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <FiSearch
              aria-hidden="true"
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              className="field pl-10"
              value={query}
              placeholder="Search brand, generic name, category or formulation"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-200 p-2">
            {matches.map(({ product, batches: productBatches }) => (
              <div key={product.id} className="rounded-md bg-slate-50 p-2">
                <p className="px-1 font-semibold text-slate-900">
                  {product.brandName}{' '}
                  <span className="font-normal text-slate-500">
                    {product.genericName} · {product.formulation}
                  </span>
                </p>
                {productBatches.map((batch) => {
                  const available = availableUnits(batch.free, 'box', batch.perBox)
                  const onOrders = Math.floor(batch.reserved / batch.perBox)
                  const first = sellFirst(batch)?.id === batch.id
                  return (
                    <div
                      key={batch.id}
                      className={`mt-1.5 grid grid-cols-1 items-center gap-2 rounded-md border bg-white p-2 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem] ${first ? 'border-brand-500' : 'border-slate-200'}`}
                    >
                      <div className="min-w-0 text-sm">
                        <p className="font-medium break-words text-slate-800">
                          {first && (
                            <span className="bg-brand-700 mr-1.5 rounded px-1.5 py-0.5 text-xs font-semibold text-white">
                              Sell first
                            </span>
                          )}
                          Batch {batch.batchNumber} ·{' '}
                          {money(
                            priceToCents(
                              wholesaleBoxPrice(
                                batch.sellPrice,
                                batch.boxSellPrice,
                                batch.wholesaleBoxPrice,
                                batch.perBox
                              )
                            )
                          )}{' '}
                          per box of {batch.perBox}
                        </p>
                        <p
                          className={
                            getExpiryStatus(batch.expiresAt) === 'near-expiry'
                              ? 'font-medium text-amber-700'
                              : 'text-slate-500'
                          }
                        >
                          {available} full box{available === 1 ? '' : 'es'} available
                          {batch.reserved > 0 &&
                            ` (${onOrders > 0 ? `${onOrders} box${onOrders === 1 ? '' : 'es'}` : `${batch.reserved} pcs`} on other orders)`}{' '}
                          · Expires {showDate(batch.expiresAt)}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        className="field"
                        placeholder="Boxes"
                        aria-label={`Boxes of ${product.brandName} batch ${batch.batchNumber}`}
                        disabled={available < 1}
                        value={boxes[batch.id] ?? ''}
                        onChange={(event) => setBoxes({ ...boxes, [batch.id]: event.target.value })}
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={available < 1}
                        onClick={() => void pick(batch.id)}
                      >
                        Add
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
            {!matches.length && (
              <p className="p-3 text-sm text-slate-500">
                {products.length
                  ? 'No products with available stock match this search.'
                  : 'No products in the catalog yet.'}
              </p>
            )}
          </div>
          {lineError && (
            <p role="alert" className="text-sm font-medium text-rose-700">
              {lineError}
            </p>
          )}
          <div className="rounded-lg border border-slate-200">
            <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
              Order Lines
            </p>
            {lines.map((line) => {
              const batch = batches.find((value) => value.id === line.batchId)
              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                  key={line.batchId}
                >
                  <span className="min-w-0 text-sm break-words">
                    <span className="font-semibold">{batch?.product.brandName}</span> · Batch{' '}
                    {batch?.batchNumber}
                    <span className="block text-xs text-slate-500">
                      {quantityLabel(line.quantity, 'box', batch?.perBox ?? 1)} ×{' '}
                      {money(line.unitPriceCents)}
                    </span>
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {money(line.quantity * line.unitPriceCents)}
                  </span>
                  <button
                    type="button"
                    className="icon-button size-9"
                    aria-label={`Remove ${batch?.product.brandName ?? 'line'}`}
                    onClick={() => setLines(lines.filter((item) => item.batchId !== line.batchId))}
                  >
                    <FiTrash2 aria-hidden="true" />
                  </button>
                </div>
              )
            })}
            {!lines.length && (
              <p className="px-3 py-3 text-sm text-slate-500">No products added yet.</p>
            )}
          </div>
          {fields.error('items')}
        </fieldset>
        {totalError && (
          <p role="alert" className="font-medium text-rose-700">
            {totalError}
          </p>
        )}
        {error && (
          <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div>
            <p className="text-xl font-bold">
              Order Total: <span className="tabular-nums">{money(total)}</span>
            </p>
            {(!lines.length || !clients.length) && (
              <p id="save-order-hint" className="mt-1 text-sm text-slate-600">
                {!clients.length
                  ? 'Add a pharmacy client before saving an order.'
                  : 'Add at least one product to save the order.'}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="secondary-button" disabled={saving} onClick={close}>
              Cancel
            </button>
            <button
              className="primary-button"
              aria-describedby={!lines.length || !clients.length ? 'save-order-hint' : undefined}
              disabled={saving || !lines.length || !!totalError || !clients.length}
            >
              {saving ? 'Saving…' : 'Save Order'}
            </button>
          </div>
        </div>
      </form>
      {confirmDialog}
    </Modal>
  )
}

/** One order's details in a dialog, so opening it is obvious and nothing needs scrolling to. */
function OrderDetails({
  order,
  admin,
  busy,
  error,
  notice,
  confirm,
  close,
  act,
  deliveryRecorded,
  setError
}: {
  order: WholesaleDetails
  admin: boolean
  busy: boolean
  error: string
  notice: string
  confirm: ReturnType<typeof useConfirm>[1]
  close: VoidFunction
  /** Runs an action, then shows `message` (or the text the action returns) and reloads. */
  act: (action: () => Promise<void | string>, message: string) => Promise<void>
  deliveryRecorded: () => Promise<void>
  setError: (message: string) => void
}): ReactElement {
  const [scheduleDate, setScheduleDate] = useState(order.scheduledDate ?? localDate())
  const [scheduleAddress, setScheduleAddress] = useState(order.deliveryAddress)
  const [deliveryNotes, setDeliveryNotes] = useState(order.deliveryNotes)
  const [driverName, setDriverName] = useState(order.driverName ?? '')
  const [receivedByName, setReceivedByName] = useState(order.receivedByName ?? '')
  const [rescheduling, setRescheduling] = useState(order.status === 'pending')
  const [showReceipt, setShowReceipt] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(localDate())
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [editingPayment, setEditingPayment] = useState<number | undefined>()
  const schedule = useFieldErrors()
  const delivery = useFieldErrors()
  const payment = useFieldErrors()
  const open = ['pending', 'scheduled'].includes(order.status)
  return (
    <Modal
      title={order.customerName}
      description={`Wholesale order ${order.reference}`}
      close={close}
      size="xl"
      busy={busy}
    >
      <div className="space-y-5">
        {error && (
          <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="status-message border-emerald-200 bg-emerald-50 text-emerald-800"
          >
            {notice}
          </p>
        )}
        {order.reviewNote && (
          <p
            role="note"
            className="status-message flex items-start gap-2 border-amber-300 bg-amber-50 text-amber-900"
          >
            <FiAlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">Retail customer. </span>
              {order.reviewNote}
            </span>
          </p>
        )}
        {/* Note: Two balanced columns that use the full width: the order (where, what, delivery)
            on the left; who handled it, the next actions and the money on the right. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Status">
            <StatusBadge status={order.status} />
          </Fact>
          <Fact label="Order Total">{money(order.totalCents)}</Fact>
          <Fact label="Delivery Date">
            {order.scheduledDate ? showDate(order.scheduledDate) : 'Not scheduled'}
          </Fact>
          <Fact label="Payment Due">{showDate(order.dueDate)}</Fact>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-5">
            <section className="space-y-2 rounded-lg border border-slate-200 p-4">
              <h4 className="card-title">Order Details</h4>
              <div className="grid gap-2 text-sm">
                <p className="break-words">
                  <span className="font-semibold text-slate-700">Delivery address: </span>
                  {order.deliveryAddress}
                </p>
                {order.deliveryNotes && (
                  <p className="break-words">
                    <span className="font-semibold text-slate-700">Delivery notes: </span>
                    {order.deliveryNotes}
                  </p>
                )}
                {order.notes && (
                  <p className="break-words">
                    <span className="font-semibold text-slate-700">Order notes: </span>
                    {order.notes}
                  </p>
                )}
              </div>
            </section>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="data-table w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr>
                    {['Product', 'Batch / Expiry', 'Quantity', 'Price', 'Total'].map((label) => (
                      <th className="px-3 py-2.5" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <tr key={item.batchId}>
                      <td className="max-w-72 px-3 py-2.5 font-medium break-words">
                        {item.productName}
                      </td>
                      <td className="px-3 py-2.5">
                        {item.batchNumber}
                        <p className="text-xs text-slate-600">Exp {showDate(item.expiresAt)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        {quantityLabel(item.quantity, item.unit, item.piecesPerUnit)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {money(item.unitPriceCents)}
                        <p className="text-xs text-slate-500">
                          per {unitWord(item.unit, item.piecesPerUnit)}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums">
                        {money(item.quantity * item.unitPriceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {order.status === 'delivered' && (
              <section
                role="status"
                className="flex flex-wrap items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"
              >
                <FiCheckCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">Delivery Recorded</p>
                  <p className="text-sm">
                    Delivered {showDateTime(order.deliveredAt!)} by{' '}
                    {order.driverName ?? 'the courier'}, received by{' '}
                    {order.receivedByName ?? 'the client'}. Recorded by {order.deliveredByName}.
                    Stock was deducted once.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setShowReceipt(!showReceipt)}
                >
                  {showReceipt ? 'Hide Delivery Receipt' : 'View Delivery Receipt'}
                </button>
              </section>
            )}
            {order.status === 'delivered' && showReceipt && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="max-h-[60vh] overflow-auto rounded-lg bg-slate-100 p-3">
                  <DeliveryReceiptSlip order={order} />
                </div>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      async () => ((await exportDeliveryReceipt(order.id)) ? undefined : ''),
                      'Delivery receipt saved.'
                    )
                  }
                >
                  Save Delivery Receipt
                </button>
              </div>
            )}
          </div>
          <aside className="min-w-0 space-y-4" aria-label="People, delivery and payment">
            <section className="space-y-2">
              <h4 className="card-title">Handled By</h4>
              <HandledBy order={order} />
            </section>
            {open && (
              <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="card-title">Delivery Schedule</h4>
                  {order.status === 'scheduled' && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => setRescheduling(!rescheduling)}
                    >
                      {rescheduling ? 'Keep Current Schedule' : 'Change Schedule'}
                    </button>
                  )}
                </div>
                {order.status === 'pending' && (
                  <p className="text-sm font-medium text-amber-800">
                    This order was created before scheduling was part of the order form. Set its
                    delivery date to continue.
                  </p>
                )}
                {rescheduling && (
                  <form
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault()
                      schedule.clear()
                      void act(async () => {
                        try {
                          await scheduleWholesale({
                            orderId: order.id,
                            scheduledDate: scheduleDate,
                            deliveryAddress: scheduleAddress,
                            deliveryNotes,
                            driverName
                          })
                        } catch (cause) {
                          schedule.capture(cause)
                        }
                        setRescheduling(false)
                      }, 'Delivery schedule saved.')
                    }}
                  >
                    <fieldset disabled={busy} className="grid gap-3">
                      <Label text="Delivery Date" required>
                        <input
                          className="field"
                          type="date"
                          min={order.orderDate}
                          value={scheduleDate}
                          onChange={(event) => setScheduleDate(event.target.value)}
                        />
                        {schedule.error('scheduledDate')}
                      </Label>
                      <Label text="Delivery Address" required>
                        <input
                          className="field"
                          maxLength={500}
                          value={scheduleAddress}
                          onChange={(event) => setScheduleAddress(event.target.value)}
                        />
                        {schedule.error('deliveryAddress')}
                      </Label>
                      <Label text="Driver / Courier">
                        <FilteredInput
                          rule="personName"
                          maxLength={120}
                          value={driverName}
                          onValueChange={setDriverName}
                        />
                        {schedule.error('driverName')}
                      </Label>
                      <Label text="Delivery Notes">
                        <input
                          className="field"
                          maxLength={500}
                          value={deliveryNotes}
                          onChange={(event) => setDeliveryNotes(event.target.value)}
                        />
                      </Label>
                      <div>
                        <button className="primary-button">Save Schedule</button>
                      </div>
                    </fieldset>
                  </form>
                )}
              </section>
            )}
            {order.status === 'scheduled' && (
              <section className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-1.5">
                  <h4 className="card-title">Proof of Delivery</h4>
                  <InfoTip label="Proof of Delivery">
                    Fill this in when the goods have reached the client. Recording the delivery
                    deducts the stock once.
                  </InfoTip>
                </div>
                <fieldset disabled={busy} className="grid gap-3">
                  <Label text="Delivered By (Driver / Courier)" required>
                    <FilteredInput
                      rule="personName"
                      maxLength={120}
                      value={driverName}
                      onValueChange={setDriverName}
                    />
                    {delivery.error('driverName')}
                  </Label>
                  <Label text="Received By (Client Side)" required>
                    <FilteredInput
                      rule="personName"
                      maxLength={120}
                      value={receivedByName}
                      onValueChange={setReceivedByName}
                    />
                    {delivery.error('receivedByName')}
                  </Label>
                </fieldset>
              </section>
            )}
            {open && (
              <div className="flex flex-wrap gap-3">
                {order.status === 'scheduled' && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={async () => {
                      delivery.clear()
                      if (driverName.trim().length < 2 || receivedByName.trim().length < 2) {
                        setError(
                          'Enter who delivered the order and who received it at the client before recording delivery.'
                        )
                        return
                      }
                      const accepted = await confirm({
                        title: 'Record Full Delivery?',
                        message:
                          'Confirm the full order has been delivered. This deducts the ordered stock once and cannot be undone here.',
                        confirmLabel: 'Record Delivery'
                      })
                      if (!accepted) return
                      await act(async () => {
                        try {
                          await deliverWholesale({ orderId: order.id, driverName, receivedByName })
                        } catch (cause) {
                          delivery.capture(cause)
                        }
                        await deliveryRecorded()
                      }, 'Delivery recorded. Stock deducted once.')
                    }}
                  >
                    Record Full Delivery
                  </button>
                )}
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={async () => {
                    const accepted = await confirm({
                      title: 'Cancel This Order?',
                      message:
                        'Cancel this undelivered order? Cancellation is permanent. Orders with payments cannot be cancelled.',
                      confirmLabel: 'Cancel Order',
                      cancelLabel: 'Keep Order',
                      tone: 'danger'
                    })
                    if (accepted)
                      await act(
                        () => cancelWholesale(order.id),
                        'Order cancelled. No stock deducted.'
                      )
                  }}
                >
                  Cancel Order
                </button>
              </div>
            )}
            {admin && order.receivable && (
              <section className="space-y-4 rounded-lg border border-slate-200 p-4">
                <div>
                  <h4 className="section-title text-lg">Accounts Receivable</h4>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    Paid {money(order.receivable.paidCents)} · Remaining{' '}
                    <span
                      className={
                        order.receivable.deadlineStatus === 'overdue' ? 'text-rose-700' : undefined
                      }
                    >
                      {money(order.receivable.remainingCents)}
                    </span>{' '}
                    · {paymentLabels[order.receivable.paymentStatus]}
                    {order.receivable.deadlineStatus === 'overdue' && (
                      <span className="text-rose-700"> · Overdue</span>
                    )}
                  </p>
                </div>
                {(order.receivable.remainingCents > 0 || editingPayment !== undefined) && (
                  <form
                    noValidate
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      payment.clear()
                      void act(async () => {
                        if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
                          payment.capture(
                            new FieldValidationError([
                              {
                                path: 'amountCents',
                                field: 'amountCents',
                                message:
                                  'Enter a payment greater than ₱0 with at most two decimal places.'
                              }
                            ])
                          )
                        }
                        try {
                          await payWholesale({
                            paymentId: editingPayment,
                            orderId: order.id,
                            amountCents: priceToCents(Number(amount)),
                            paidAt,
                            reference,
                            method: method as (typeof paymentMethods)[number],
                            notes: paymentNotes
                          })
                        } catch (cause) {
                          payment.capture(cause)
                        }
                        setEditingPayment(undefined)
                        setAmount('')
                        setReference('')
                        setPaymentNotes('')
                        setMethod('')
                      }, 'Payment saved. Balance updated.')
                    }}
                  >
                    <RequiredNote />
                    <fieldset disabled={busy} className="grid gap-3">
                      <Label text="Payment Amount (₱)" required>
                        <input
                          className="field"
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={
                            (order.receivable.remainingCents +
                              (order.payments?.find((item) => item.id === editingPayment)
                                ?.amountCents ?? 0)) /
                            100
                          }
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                        />
                        {payment.error('amountCents')}
                      </Label>
                      <Label text="Payment Date" required>
                        <input
                          className="field"
                          type="date"
                          min={order.orderDate}
                          max={localDate()}
                          value={paidAt}
                          onChange={(event) => setPaidAt(event.target.value)}
                        />
                        {payment.error('paidAt')}
                      </Label>
                      <Label text="Payment Reference" required>
                        <FilteredInput
                          rule="reference"
                          maxLength={120}
                          placeholder="Unique, e.g. OR-1024 or a transfer number"
                          value={reference}
                          onValueChange={setReference}
                        />
                        {payment.error('reference')}
                      </Label>
                      <Label text="Payment Method" required>
                        <select
                          className="field"
                          value={method}
                          onChange={(event) => setMethod(event.target.value)}
                        >
                          <option value="">Select a method</option>
                          {paymentMethods.map((value) => (
                            <option key={value} value={value}>
                              {paymentMethodLabel(value)}
                            </option>
                          ))}
                        </select>
                        {payment.error('method')}
                      </Label>
                      <Label text="Payment Notes">
                        <input
                          className="field"
                          maxLength={500}
                          value={paymentNotes}
                          onChange={(event) => setPaymentNotes(event.target.value)}
                        />
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        <button className="primary-button">
                          {editingPayment !== undefined
                            ? 'Save Payment Correction'
                            : 'Record Payment'}
                        </button>
                        {editingPayment !== undefined && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setEditingPayment(undefined)
                              setAmount('')
                              setReference('')
                              setPaymentNotes('')
                              setMethod('')
                            }}
                          >
                            Cancel Correction
                          </button>
                        )}
                      </div>
                    </fieldset>
                  </form>
                )}
              </section>
            )}
            {admin && order.receivable && (
              <section className="space-y-3">
                <h4 className="card-title">Payment History</h4>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <table className="data-table w-full min-w-[550px] text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          'Date',
                          'Reference',
                          'Method',
                          'Amount',
                          'Notes',
                          'Recorded By',
                          'Action'
                        ].map((label) => (
                          <th className="px-3 py-2.5" key={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {order.payments?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2.5">{showDate(item.paidAt)}</td>
                          <td className="max-w-52 px-3 py-2.5 break-all">{item.reference}</td>
                          <td className="px-3 py-2.5">{paymentMethodLabel(item.method)}</td>
                          <td className="px-3 py-2.5 tabular-nums">{money(item.amountCents)}</td>
                          <td className="max-w-64 px-3 py-2.5 break-words">{item.notes}</td>
                          <td className="px-3 py-2.5">
                            {item.recordedByName}
                            {item.updatedAt !== item.createdAt && (
                              <p className="text-xs text-slate-500">
                                Edited by {item.updatedByName}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => {
                                setEditingPayment(item.id)
                                setAmount(String(item.amountCents / 100))
                                setPaidAt(item.paidAt)
                                setReference(item.reference)
                                // Note: Older payments may have a free-text method; pick one again.
                                setMethod(
                                  (paymentMethods as readonly string[]).includes(item.method)
                                    ? item.method
                                    : ''
                                )
                                setPaymentNotes(item.notes)
                              }}
                            >
                              Correct Payment
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!order.payments?.length && (
                  <p className="text-sm text-slate-500">No payments recorded.</p>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>
    </Modal>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <div className="mt-1 font-semibold text-slate-900">{children}</div>
    </div>
  )
}

const when = (value: string | null): string => (value ? ` · ${showDateTime(value)}` : '')

/** Who handled each step of a wholesale order, so every hand-off is accountable. */
function HandledBy({ order }: { order: WholesaleDetails }): ReactElement {
  const rows: Array<[string, string | null, string | null]> = [
    ['Order created by', order.createdByName, order.createdAt],
    ['Delivery scheduled by', order.scheduledByName, order.scheduledAt],
    ['Delivered by (driver / courier)', order.driverName, null],
    ['Delivery recorded by', order.deliveredByName, order.deliveredAt],
    ['Received by (client)', order.receivedByName, null],
    ...(order.status === 'cancelled'
      ? ([['Cancelled by', order.cancelledByName, order.cancelledAt]] as Array<
          [string, string | null, string | null]
        >)
      : [])
  ]
  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(([label, name, at]) => (
        <div className="contents" key={label}>
          <dt className="text-slate-600">{label}</dt>
          <dd className={name ? 'font-medium' : 'text-slate-600'}>
            {name ? `${name}${when(at)}` : 'Not recorded'}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Pharmacy clients are other pharmacies that buy by the box. They are kept apart from retail
 * customers, so they are added and edited here rather than under Customers.
 */
function PharmacyClients({ clients }: { clients: CustomerProfile[] }): ReactElement {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const search = query.trim().toLowerCase()
    return clients.filter(
      (client) =>
        !search ||
        `${client.fullName} ${client.contactPerson} ${client.phone} ${client.address}`
          .toLowerCase()
          .includes(search)
    )
  }, [clients, query])
  return (
    <section className="panel space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="section-title">Pharmacy Clients ({clients.length})</h3>
            <InfoTip label="Pharmacy Clients">
              Other pharmacies that order by the box. Open one to edit its contact person, phone or
              delivery address.
            </InfoTip>
          </div>
        </div>
        <Link
          to="/wholesale/clients/$clientId"
          params={{ clientId: 'new' }}
          className="secondary-button"
        >
          <FiPlus aria-hidden="true" /> Add Pharmacy Client
        </Link>
      </div>
      {clients.length > 0 && (
        <label className="field-label block max-w-xl">
          Find a Client
          <span className="relative mt-1.5 block font-normal">
            <FiSearch
              aria-hidden="true"
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              className="field pl-10"
              maxLength={100}
              value={query}
              placeholder="Pharmacy name, contact person or phone"
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </label>
      )}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
        {shown.map((client) => (
          <Link
            key={client.id}
            to="/wholesale/clients/$clientId"
            params={{ clientId: String(client.id) }}
            className="group flex items-center gap-4 bg-white px-4 py-3 transition hover:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{client.fullName}</p>
              <p className="truncate text-sm text-slate-500">
                {[
                  client.contactPerson,
                  client.phone,
                  client.address,
                  client.tin && `TIN ${client.tin}`
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <FiChevronRight
              aria-hidden="true"
              className="group-hover:text-brand-700 shrink-0 text-slate-400"
            />
          </Link>
        ))}
        {shown.length === 0 && (
          <p className="bg-white p-6 text-center text-sm text-slate-500">
            {clients.length
              ? 'No pharmacy clients match this search.'
              : 'No pharmacy clients yet. Add one before placing a wholesale order.'}
          </p>
        )}
      </div>
    </section>
  )
}
