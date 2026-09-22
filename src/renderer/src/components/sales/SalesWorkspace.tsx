import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { getSellableStock, type CustomerProfile, type ItemProfile } from '@renderer/data/profiles'
import { useAccount } from '@renderer/hooks/useAccount'
import { getCustomers, getProducts } from '@renderer/services/profiles'
import { completeSale, exportReceipt, getSale, getSaleHistory } from '@renderer/services/sales'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { expiryLabels, getExpiryStatus, isBatchSellable } from '@shared/inventory'
import {
  calculateSale,
  customerDiscount,
  money,
  priceToCents,
  receiptText,
  removeCartItem,
  setCartQuantity,
  type CartLine,
  type Checkout,
  type SaleRecord
} from '@shared/sales'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'

export default function SalesWorkspace(): ReactElement {
  const { account } = useAccount()
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [customers, setCustomers] = useState<CustomerProfile[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [cash, setCash] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState<SaleRecord | null>(null)
  const [history, setHistory] = useState<Omit<SaleRecord, 'items'>[] | null>(null)
  const [more, setMore] = useState(false)
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const paying = useRef(false)
  const fail = (cause: unknown): void =>
    setError(cause instanceof Error ? cause.message : 'Unable to load sales data.')
  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      const [items, people] = await Promise.all([getProducts(), getCustomers()])
      setProducts(items)
      setCustomers(people)
    } catch (cause) {
      fail(cause)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    void Promise.all([getProducts(), getCustomers()])
      .then(([items, people]) => {
        if (active) {
          setProducts(items)
          setCustomers(people)
          setLoading(false)
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          fail(cause)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])
  const matches = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/)
    return products.filter((product) =>
      terms.every((term) =>
        `${product.brandName} ${product.genericName} ${product.formulation} ${product.category}`
          .toLowerCase()
          .includes(term)
      )
    )
  }, [products, query])
  const product = products.find((item) => item.id === selected)
  const pricing = useMemo(() => {
    try {
      const customer = customers.find((item) => item.id === customerId) ?? null
      return { totals: calculateSale(cart, customerDiscount(customer)), error: '' }
    } catch (cause) {
      return {
        totals: calculateSale([], 'none'),
        error: cause instanceof Error ? cause.message : 'Invalid eligibility.'
      }
    }
  }, [cart, customers, customerId])
  const changeQuantity = (batchId: number, quantity: number): void => {
    setError('')
    try {
      const batch = products.flatMap((item) => item.batches).find((item) => item.id === batchId)
      if (!batch || !isBatchSellable(batch.stock, batch.expiresAt))
        throw new Error('This batch is unavailable or expired.')
      setCart(
        setCartQuantity(
          cart,
          { batchId, quantity, unitPriceCents: priceToCents(batch.sellPrice) },
          batch.stock
        )
      )
    } catch (cause) {
      fail(cause)
    }
  }
  const pay = async (): Promise<void> => {
    if (paying.current) return
    paying.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (pricing.error) throw new Error(pricing.error)
      if (!/^\d+(\.\d{1,2})?$/.test(cash))
        throw new Error('Enter cash received with at most two decimal places.')
      const values = {
        customerId,
        items: cart,
        expectedTotalCents: pricing.totals.totalCents,
        cashCents: priceToCents(Number(cash))
      }
      const fingerprint = JSON.stringify(values)
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, requestId: crypto.randomUUID() }
      const data: Checkout = { ...values, requestId: pending.current.requestId }
      const saved = await completeSale(data)
      setReceipt(saved)
      setCart([])
      setCash('')
      setCustomerId(null)
      pending.current = null
      setHistory(null)
      setNotice('Payment recorded. Receipt is ready.')
      useProfileStore.getState().reset()
      await refresh()
    } catch (cause) {
      fail(cause)
    } finally {
      paying.current = false
      setBusy(false)
    }
  }
  const loadHistory = async (append = false): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const records = await getSaleHistory(append ? history?.at(-1)?.id : undefined)
      setHistory(append ? [...(history ?? []), ...records] : records)
      setMore(records.length === 50)
    } catch (cause) {
      fail(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <DashboardShell pageTitle="Sales & dispensing">
      <div className="space-y-5">
        <header className="page-intro flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="eyebrow">Point of sale</p>
            <h2 className="text-2xl font-semibold">Sales & dispensing</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              Refresh stock
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => (history ? setHistory(null) : void loadHistory())}
            >
              {history
                ? 'Back to checkout'
                : account?.role === 'master'
                  ? 'Transaction history'
                  : 'My transactions'}
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
            {notice}
          </p>
        )}
        {history ? (
          <section className="panel space-y-3 p-5">
            <h3 className="font-semibold">Completed transactions</h3>
            <p className="text-sm text-neutral-500">
              Newest first · {account?.role === 'master' ? 'All cashiers' : 'Your sales only'}
            </p>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr>
                    {['Reference / date', 'Customer', 'Cashier', 'Total', 'Receipt'].map(
                      (label) => (
                        <th className="p-3" key={label}>
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {history.map((sale) => (
                    <tr className="border-t border-neutral-100" key={sale.id}>
                      <td className="max-w-64 p-3 break-all">
                        {sale.reference}
                        <p>{new Date(sale.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="p-3">{sale.customerName}</td>
                      <td className="p-3">{sale.cashierName}</td>
                      <td className="p-3">{money(sale.totalCents)}</td>
                      <td className="p-3">
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true)
                            void getSale(sale.id)
                              .then(setReceipt)
                              .catch(fail)
                              .finally(() => setBusy(false))
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!history.length && <p>No completed transactions yet.</p>}
            {more && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void loadHistory(true)}
              >
                Load older transactions
              </button>
            )}
          </section>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
            <section className="panel min-w-0 space-y-4 p-5">
              <label className="block text-sm font-medium">
                Search medicines
                <input
                  className="field"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Brand, generic name, category, formulation"
                />
              </label>
              {loading && <p role="status">Loading current stock…</p>}
              <div className="max-h-64 space-y-2 overflow-auto">
                {matches.map((item) => (
                  <button
                    key={item.id}
                    className={`block w-full rounded-xl border p-3 text-left ${selected === item.id ? 'border-mauve-500 bg-mauve-50' : 'border-neutral-200'}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="font-semibold break-words">{item.brandName}</span>
                    <span className="ml-2 text-sm">{getSellableStock(item)} sellable</span>
                    <p className="text-sm text-neutral-500">
                      {item.genericName} · {item.formulation} · {item.category}
                    </p>
                  </button>
                ))}
                {!loading && !matches.length && <p>No matching products.</p>}
              </div>
              {product ? (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="font-semibold break-words">{product.brandName} — batches</h3>
                  <p className="text-sm text-neutral-500">
                    Select the batch being dispensed.{' '}
                    {product.prescriptionRequired ? 'Prescription required. ' : ''}
                    {product.controlled ? 'Controlled medicine.' : ''}
                  </p>
                  {product.batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3"
                    >
                      <div className="min-w-0 break-words">
                        <p className="font-medium">
                          {batch.batchNumber} · {money(priceToCents(batch.sellPrice))}
                        </p>
                        <p className="text-sm">
                          {batch.stock} on hand · Expires {batch.expiresAt}
                        </p>
                        <p
                          className={`text-sm ${isBatchSellable(batch.stock, batch.expiresAt) ? 'text-neutral-500' : 'text-rose-700'}`}
                        >
                          {expiryLabels[getExpiryStatus(batch.expiresAt)]}
                        </p>
                      </div>
                      <button
                        className="primary-button"
                        disabled={busy || !isBatchSellable(batch.stock, batch.expiresAt)}
                        onClick={() =>
                          changeQuantity(
                            batch.id,
                            (cart.find((item) => item.batchId === batch.id)?.quantity ?? 0) + 1
                          )
                        }
                      >
                        Add one
                      </button>
                    </div>
                  ))}
                  {!product.batches.length && <p>No stock batches recorded.</p>}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  Select a product to view batch, expiry, and price details.
                </p>
              )}
            </section>
            <section className="panel min-w-0 space-y-4 p-5">
              <h3 className="text-lg font-semibold">Current cart</h3>
              {!cart.length && (
                <p className="text-sm text-neutral-500">Add a product to start a transaction.</p>
              )}
              <div className="max-h-80 space-y-3 overflow-auto">
                {cart.map((line) => {
                  const item = products.find((value) =>
                    value.batches.some((batch) => batch.id === line.batchId)
                  )
                  const batch = item?.batches.find((value) => value.id === line.batchId)
                  return (
                    <div
                      className="space-y-2 rounded-xl border border-neutral-200 p-3"
                      key={line.batchId}
                    >
                      <p className="font-medium break-words">
                        {item?.brandName ?? 'Unavailable product'} · {batch?.batchNumber}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="text-sm">
                          Quantity
                          <input
                            aria-label={`Quantity for ${item?.brandName} batch ${batch?.batchNumber}`}
                            className="field w-24"
                            type="number"
                            min="1"
                            max={batch?.stock}
                            step="1"
                            value={line.quantity}
                            disabled={busy}
                            onChange={(event) =>
                              changeQuantity(line.batchId, Number(event.target.value))
                            }
                          />
                        </label>
                        <p className="text-sm">
                          {money(line.unitPriceCents)} each
                          <br />
                          {money(line.unitPriceCents * line.quantity)}
                        </p>
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => setCart(removeCartItem(cart, line.batchId))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <label className="block text-sm font-medium">
                Customer
                <select
                  className="field"
                  value={customerId ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    setCustomerId(event.target.value ? Number(event.target.value) : null)
                  }
                >
                  <option value="">Walk-in / no discount</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.fullName} · {customer.discountType}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-neutral-500">
                Registered Senior/PWD eligibility applies 12% VAT exemption, then 20% discount.
              </p>
              {pricing.error && (
                <p role="alert" className="text-sm text-rose-700">
                  {pricing.error}
                </p>
              )}
              <dl className="space-y-2 rounded-xl bg-neutral-50 p-4">
                <div className="flex justify-between gap-3">
                  <dt>Subtotal</dt>
                  <dd>{money(pricing.totals.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>VAT exemption</dt>
                  <dd>−{money(pricing.totals.vatExemptionCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Discount</dt>
                  <dd>−{money(pricing.totals.discountCents)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t pt-3 text-xl font-bold">
                  <dt>Total due</dt>
                  <dd>{money(pricing.totals.totalCents)}</dd>
                </div>
              </dl>
              <label className="block text-sm font-medium">
                Cash received (₱)
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cash}
                  disabled={busy}
                  onChange={(event) => setCash(event.target.value)}
                />
              </label>
              <p className="font-semibold">
                Change:{' '}
                {money(
                  Math.max(0, Math.round((Number(cash) || 0) * 100) - pricing.totals.totalCents)
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="primary-button"
                  disabled={busy || loading || !cart.length || !!pricing.error}
                  onClick={() => void pay()}
                >
                  {busy ? 'Processing…' : 'Complete cash payment'}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || !cart.length}
                  onClick={() => {
                    setCart([])
                    setCash('')
                    setCustomerId(null)
                    pending.current = null
                    setError('')
                    setNotice('Cart cancelled. No payment or stock change was recorded.')
                  }}
                >
                  Cancel transaction
                </button>
              </div>
            </section>
          </div>
        )}
        {receipt && <Receipt sale={receipt} close={() => setReceipt(null)} />}
      </div>
    </DashboardShell>
  )
}

export function Receipt({ sale, close }: { sale: SaleRecord; close: VoidFunction }): ReactElement {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-neutral-950/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Completed sale receipt"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-auto rounded-2xl bg-white p-5"
      >
        <div className="mb-4 flex flex-wrap justify-between gap-3">
          <h2 className="text-xl font-semibold">Completed sale</h2>
          <button className="secondary-button" onClick={close}>
            Close
          </button>
        </div>
        <pre className="font-mono text-sm break-words whitespace-pre-wrap">{receiptText(sale)}</pre>
        <button
          className="primary-button mt-4"
          disabled={saving}
          onClick={() => {
            setSaving(true)
            setMessage('')
            void exportReceipt(sale.id)
              .then((saved) => setMessage(saved ? 'Receipt saved.' : ''))
              .catch(() =>
                setMessage('Receipt export failed. The sale is saved; retry here or from history.')
              )
              .finally(() => setSaving(false))
          }}
        >
          {saving ? 'Saving…' : 'Save receipt'}
        </button>
        {message && (
          <p role="status" className="mt-3 text-sm">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}
