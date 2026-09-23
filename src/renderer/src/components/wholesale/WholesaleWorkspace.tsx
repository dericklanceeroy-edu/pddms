import DashboardShell from '@renderer/components/dashboard/DashboardShell'
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
  scheduleWholesale,
  wholesaleAlerts
} from '@renderer/services/wholesale'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { isBatchSellable, localDate } from '@shared/inventory'
import { calculateSale, money, priceToCents, type CartLine } from '@shared/sales'
import {
  deliveryReceiptText,
  orderStatuses,
  wholesaleOrderSchema,
  type WholesaleDetails,
  type WholesaleFilter,
  type WholesaleSummary
} from '@shared/wholesale'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

export default function WholesaleWorkspace(): ReactElement {
  const { account } = useAccount()
  const admin = account?.role === 'master'
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [customers, setCustomers] = useState<CustomerProfile[]>([])
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
  const [customerId, setCustomerId] = useState('')
  const [dueDate, setDueDate] = useState(localDate())
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [batchId, setBatchId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [scheduleDate, setScheduleDate] = useState(localDate())
  const [scheduleAddress, setScheduleAddress] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(localDate())
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState('Cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [editingPayment, setEditingPayment] = useState<number | undefined>()
  const [showReceipt, setShowReceipt] = useState(false)
  const pending = useRef<{ fingerprint: string; id: string } | null>(null)
  const working = useRef(false)
  const selectedId = useRef<number | null>(null)
  const fail = (cause: unknown): void =>
    setError(cause instanceof Error ? cause.message : 'Unable to load wholesale data.')
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
      .then(([items, clients]) => {
        if (active) {
          setProducts(items)
          setCustomers(clients)
        }
      })
      .catch((cause) => {
        if (active) fail(cause)
      })
    return () => {
      active = false
    }
  }, [])
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
  const select = (order: WholesaleDetails): void => {
    selectedId.current = order.id
    setSelected(order)
    setScheduleDate(order.scheduledDate ?? localDate())
    setScheduleAddress(order.deliveryAddress)
    setDeliveryNotes(order.deliveryNotes)
    setAmount('')
    setEditingPayment(undefined)
    setReference('')
    setPaymentNotes('')
    setShowReceipt(false)
  }
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
  const update = async (action: () => Promise<void>, message: string): Promise<void> => {
    await action()
    setNotice(message)
    if (selectedId.current) select(await getWholesale(selectedId.current))
    await reload()
  }
  const batches = products.flatMap((product) =>
    product.batches.map((batch) => ({ ...batch, productName: product.brandName }))
  )
  let total = 0
  let totalError = ''
  try {
    total = calculateSale(lines, 'none').totalCents
  } catch (cause) {
    totalError = cause instanceof Error ? cause.message : 'Invalid total.'
  }
  return (
    <DashboardShell pageTitle="Wholesale & distributor">
      <div className="space-y-5">
        <header className="page-intro flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="eyebrow">Client orders & deliveries</p>
            <h2 className="text-2xl font-semibold">Wholesale & distributor</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await reload()
                  const [items, clients] = await Promise.all([getProducts(), getCustomers()])
                  setProducts(items)
                  setCustomers(clients)
                  if (selectedId.current) select(await getWholesale(selectedId.current))
                })
              }
            >
              Refresh
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => setCreating(!creating)}
            >
              {creating ? 'Hide order form' : 'New order'}
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
            {notice}
          </p>
        )}
        {admin && (
          <div
            role="status"
            className={`rounded-xl p-4 ${alerts.count ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {alerts.count
              ? `${alerts.count} overdue accounts · ${money(alerts.remainingCents)} outstanding`
              : 'No overdue wholesale accounts.'}
            {alerts.count > 0 && (
              <button
                className="secondary-button ml-3"
                disabled={busy}
                onClick={() => {
                  setSearch('')
                  setFilter({ overdue: true })
                }}
              >
                Review overdue
              </button>
            )}
          </div>
        )}
        {creating && (
          <form
            className="panel space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                const values = {
                  customerId: Number(customerId),
                  dueDate,
                  deliveryAddress: address,
                  notes,
                  items: lines
                }
                const fingerprint = JSON.stringify(values)
                if (pending.current?.fingerprint !== fingerprint)
                  pending.current = { fingerprint, id: crypto.randomUUID() }
                const parsed = wholesaleOrderSchema.safeParse({
                  ...values,
                  requestId: pending.current.id
                })
                if (!parsed.success)
                  throw new Error(
                    parsed.error.issues
                      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                      .join(' ')
                  )
                const id = await createWholesale(parsed.data)
                pending.current = null
                setLines([])
                setNotes('')
                setCreating(false)
                select(await getWholesale(id))
                await reload()
                setNotice('Order saved. Inventory is unchanged until delivery.')
              })
            }}
          >
            <h3 className="text-lg font-semibold">Record wholesale order</h3>
            <p className="text-sm text-neutral-500">
              Uses catalog prices. Stock is not reserved; availability is rechecked at delivery.
              Partial payments are supported.
            </p>
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  Client *
                  <select
                    required
                    className="field"
                    value={customerId}
                    onChange={(event) => {
                      setCustomerId(event.target.value)
                      setAddress(
                        customers.find((client) => client.id === Number(event.target.value))
                          ?.address ?? ''
                      )
                    }}
                  >
                    <option value="">Select existing customer</option>
                    {customers.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Payment due date *
                  <input
                    required
                    type="date"
                    className="field"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
              </div>
              <label className="block">
                Delivery address *
                <input
                  required
                  maxLength={500}
                  className="field"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </label>
              <label className="block">
                Order notes
                <input
                  maxLength={500}
                  className="field"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1">
                  Product / batch
                  <select
                    className="field"
                    value={batchId}
                    onChange={(event) => setBatchId(event.target.value)}
                  >
                    <option value="">Select batch</option>
                    {batches.map((batch) => (
                      <option
                        disabled={!isBatchSellable(batch.stock, batch.expiresAt)}
                        key={batch.id}
                        value={batch.id}
                      >
                        {batch.productName} · {batch.batchNumber} · {batch.stock} available ·{' '}
                        {money(priceToCents(batch.sellPrice))} · Exp {batch.expiresAt}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="field w-28"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    const batch = batches.find((value) => value.id === Number(batchId))
                    const qty = Number(quantity)
                    if (
                      !batch ||
                      !isBatchSellable(batch.stock, batch.expiresAt) ||
                      !Number.isInteger(qty) ||
                      qty <= 0 ||
                      qty > 1_000_000
                    ) {
                      setError(
                        'Select an available batch and a positive whole quantity (up to 1,000,000).'
                      )
                      return
                    }
                    const existing = lines.find((line) => line.batchId === batch.id)
                    const line = {
                      batchId: batch.id,
                      quantity: qty + (existing?.quantity ?? 0),
                      unitPriceCents: priceToCents(batch.sellPrice)
                    }
                    setLines(
                      existing
                        ? lines.map((item) => (item.batchId === batch.id ? line : item))
                        : [...lines, line]
                    )
                    setError('')
                  }}
                >
                  Add item
                </button>
              </div>
              <div className="max-h-64 space-y-2 overflow-auto">
                {lines.map((line) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
                    key={line.batchId}
                  >
                    <span className="min-w-0 break-words">
                      {batches.find((batch) => batch.id === line.batchId)?.productName} · Batch{' '}
                      {batches.find((batch) => batch.id === line.batchId)?.batchNumber} ·{' '}
                      {line.quantity} × {money(line.unitPriceCents)}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setLines(lines.filter((item) => item.batchId !== line.batchId))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              {!lines.length && <p className="text-sm text-neutral-500">No products added.</p>}
              {totalError && (
                <p role="alert" className="text-rose-700">
                  {totalError}
                </p>
              )}
              <p className="text-xl font-semibold">Order total: {money(total)}</p>
              <button className="primary-button" disabled={!lines.length || !!totalError}>
                {busy ? 'Saving…' : 'Save order'}
              </button>
            </fieldset>
          </form>
        )}
        <section className="panel space-y-4 p-5">
          <h3 className="text-lg font-semibold">Orders & delivery schedule</h3>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              setFilter({ ...filter, search, beforeId: undefined })
            }}
          >
            <label className="min-w-0 flex-1">
              Client / reference
              <input
                className="field"
                maxLength={100}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Status
              <select
                className="field"
                value={filter.status ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    status: (event.target.value as WholesaleFilter['status']) || undefined
                  })
                }
              >
                <option value="">All statuses</option>
                {orderStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            {admin && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!filter.overdue}
                  disabled={busy}
                  onChange={(event) => setFilter({ ...filter, overdue: event.target.checked })}
                />
                Overdue only
              </label>
            )}
            <button className="secondary-button" disabled={busy}>
              Search
            </button>
          </form>
          {loading && <p role="status">Loading orders…</p>}
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    'Client / reference',
                    'Order / due date',
                    'Delivery',
                    'Total',
                    ...(admin ? ['Paid / remaining', 'Payment status'] : []),
                    'Details'
                  ].map((label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-neutral-100">
                    <td className="max-w-64 p-3 break-words">
                      {order.customerName}
                      <p className="text-xs break-all text-neutral-500">{order.reference}</p>
                    </td>
                    <td className="p-3">
                      {order.orderDate}
                      <p>Due {order.dueDate}</p>
                    </td>
                    <td className="p-3">
                      {order.status}
                      <p>{order.scheduledDate ?? 'Not scheduled'}</p>
                    </td>
                    <td className="p-3">{money(order.totalCents)}</td>
                    {admin && (
                      <>
                        <td className="p-3">
                          {order.receivable ? (
                            <>
                              {money(order.receivable.paidCents)} paid
                              <p>{money(order.receivable.remainingCents)} remaining</p>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td
                          className={`p-3 ${order.receivable?.deadlineStatus === 'overdue' ? 'text-rose-700' : order.receivable?.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}
                        >
                          {order.receivable?.paymentStatus.replaceAll('_', ' ')}
                          <p>{order.receivable?.deadlineStatus}</p>
                        </td>
                      </>
                    )}
                    <td className="p-3">
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void run(async () => select(await getWholesale(order.id)))}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !orders.length && <p>No wholesale orders match these filters.</p>}
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
              Load older orders
            </button>
          )}
        </section>
        {selected && (
          <section className="panel min-w-0 space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold break-words">{selected.customerName}</h3>
                <p className="text-sm break-all">{selected.reference}</p>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  selectedId.current = null
                  setSelected(null)
                }}
              >
                Close details
              </button>
            </div>
            <p>
              {selected.status} · Total {money(selected.totalCents)} · Due {selected.dueDate}
            </p>
            <p className="break-words">{selected.deliveryAddress}</p>
            <p className="break-words">{selected.notes}</p>
            <div className="overflow-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr>
                    {['Product', 'Batch / expiry', 'Quantity', 'Price', 'Total'].map((label) => (
                      <th className="p-3" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr className="border-t border-neutral-100" key={item.batchId}>
                      <td className="max-w-72 p-3 break-words">{item.productName}</td>
                      <td className="p-3">
                        {item.batchNumber}
                        <p>{item.expiresAt}</p>
                      </td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">{money(item.unitPriceCents)}</td>
                      <td className="p-3">{money(item.quantity * item.unitPriceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {['pending', 'scheduled'].includes(selected.status) && (
              <>
                <form
                  className="space-y-3 rounded-xl border border-neutral-200 p-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(() =>
                      update(
                        () =>
                          scheduleWholesale({
                            orderId: selected.id,
                            scheduledDate: scheduleDate,
                            deliveryAddress: scheduleAddress,
                            deliveryNotes
                          }),
                        'Delivery schedule saved.'
                      )
                    )
                  }}
                >
                  <h4 className="font-semibold">Delivery schedule</h4>
                  <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
                    <label>
                      Scheduled date *
                      <input
                        className="field"
                        type="date"
                        required
                        min={selected.orderDate}
                        value={scheduleDate}
                        onChange={(event) => setScheduleDate(event.target.value)}
                      />
                    </label>
                    <label>
                      Delivery address *
                      <input
                        className="field"
                        required
                        maxLength={500}
                        value={scheduleAddress}
                        onChange={(event) => setScheduleAddress(event.target.value)}
                      />
                    </label>
                    <label className="md:col-span-2">
                      Delivery notes
                      <input
                        className="field"
                        maxLength={500}
                        value={deliveryNotes}
                        onChange={(event) => setDeliveryNotes(event.target.value)}
                      />
                    </label>
                    <button className="secondary-button">Save schedule</button>
                  </fieldset>
                </form>
                <div className="flex flex-wrap gap-3">
                  {selected.status === 'scheduled' && (
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Confirm the full order has been delivered? This deducts the ordered stock once and cannot be undone here.'
                          )
                        )
                          return
                        void run(async () => {
                          await update(
                            () => deliverWholesale(selected.id),
                            'Delivery recorded. Stock deducted once.'
                          )
                          useProfileStore.getState().reset()
                          setProducts(await getProducts())
                        })
                      }}
                    >
                      Record full delivery
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Cancel this undelivered order? Orders with payments cannot be cancelled.'
                        )
                      )
                        void run(() =>
                          update(
                            () => cancelWholesale(selected.id),
                            'Order cancelled. No stock deducted.'
                          )
                        )
                    }}
                  >
                    Cancel order
                  </button>
                </div>
              </>
            )}
            {selected.status === 'delivered' && (
              <div className="space-y-3">
                <p>
                  Delivered {new Date(selected.deliveredAt!).toLocaleString()} ·{' '}
                  {selected.deliveredByName}
                </p>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setShowReceipt(!showReceipt)}
                >
                  {showReceipt ? 'Hide receipt' : 'View delivery receipt'}
                </button>
                {showReceipt && (
                  <div className="max-h-[65vh] space-y-3 overflow-auto rounded-xl border border-neutral-200 p-4">
                    <pre className="text-sm break-words whitespace-pre-wrap">
                      {deliveryReceiptText(selected)}
                    </pre>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (await exportDeliveryReceipt(selected.id))
                            setNotice('Delivery receipt saved.')
                        })
                      }
                    >
                      Save delivery receipt
                    </button>
                  </div>
                )}
              </div>
            )}
            {admin && selected.receivable && (
              <section className="space-y-4 border-t border-neutral-200 pt-4">
                <h4 className="text-lg font-semibold">Accounts receivable</h4>
                <p className="font-semibold">
                  Paid {money(selected.receivable.paidCents)} · Remaining{' '}
                  {money(selected.receivable.remainingCents)} ·{' '}
                  {selected.receivable.paymentStatus.replaceAll('_', ' ')} ·{' '}
                  {selected.receivable.deadlineStatus}
                </p>
                {(selected.receivable.remainingCents > 0 || editingPayment !== undefined) && (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void run(async () => {
                        if (!/^\d+(\.\d{1,2})?$/.test(amount))
                          throw new Error(
                            'Enter a positive payment with at most two decimal places.'
                          )
                        await update(
                          () =>
                            payWholesale({
                              paymentId: editingPayment,
                              orderId: selected.id,
                              amountCents: priceToCents(Number(amount)),
                              paidAt,
                              reference,
                              method,
                              notes: paymentNotes
                            }),
                          'Payment saved. Balance updated.'
                        )
                      })
                    }}
                  >
                    <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
                      <label>
                        Payment amount (₱) *
                        <input
                          required
                          className="field"
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={
                            (selected.receivable.remainingCents +
                              (selected.payments?.find((payment) => payment.id === editingPayment)
                                ?.amountCents ?? 0)) /
                            100
                          }
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                        />
                      </label>
                      <label>
                        Payment date *
                        <input
                          required
                          className="field"
                          type="date"
                          min={selected.orderDate}
                          max={localDate()}
                          value={paidAt}
                          onChange={(event) => setPaidAt(event.target.value)}
                        />
                      </label>
                      <label>
                        Unique payment reference *
                        <input
                          required
                          className="field"
                          maxLength={120}
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                        />
                      </label>
                      <label>
                        Method *
                        <input
                          required
                          className="field"
                          maxLength={80}
                          value={method}
                          onChange={(event) => setMethod(event.target.value)}
                        />
                      </label>
                      <label>
                        Payment notes
                        <input
                          className="field"
                          maxLength={500}
                          value={paymentNotes}
                          onChange={(event) => setPaymentNotes(event.target.value)}
                        />
                      </label>
                      <button className="primary-button">
                        {editingPayment !== undefined
                          ? 'Save payment correction'
                          : 'Record payment'}
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
                          }}
                        >
                          Cancel correction
                        </button>
                      )}
                    </fieldset>
                  </form>
                )}
                <div className="max-h-64 overflow-auto">
                  <table className="w-full min-w-[550px] text-left text-sm">
                    <thead>
                      <tr>
                        {['Date', 'Reference', 'Method', 'Amount', 'Notes', 'Action'].map(
                          (label) => (
                            <th className="p-3" key={label}>
                              {label}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.payments?.map((payment) => (
                        <tr key={payment.id} className="border-t border-neutral-100">
                          <td className="p-3">{payment.paidAt}</td>
                          <td className="max-w-52 p-3 break-all">{payment.reference}</td>
                          <td className="p-3">{payment.method}</td>
                          <td className="p-3">{money(payment.amountCents)}</td>
                          <td className="max-w-64 p-3 break-words">{payment.notes}</td>
                          <td className="p-3">
                            <button
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => {
                                setEditingPayment(payment.id)
                                setAmount(String(payment.amountCents / 100))
                                setPaidAt(payment.paidAt)
                                setReference(payment.reference)
                                setMethod(payment.method)
                                setPaymentNotes(payment.notes)
                              }}
                            >
                              Correct payment
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!selected.payments?.length && <p>No payments recorded.</p>}
              </section>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  )
}
