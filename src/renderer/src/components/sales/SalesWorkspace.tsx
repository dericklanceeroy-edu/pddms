import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import FilteredInput from '@renderer/components/ui/FilteredInput'
import { getSellableStock, type CustomerProfile, type ItemProfile } from '@renderer/data/profiles'
import { useAccount } from '@renderer/hooks/useAccount'
import { getCustomers, getProducts } from '@renderer/services/profiles'
import { completeSale, getSale, getSaleHistory } from '@renderer/services/sales'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { expiryLabels, getExpiryStatus, isBatchSellable, localDate } from '@shared/inventory'
import {
  calculateSale,
  money,
  priceToCents,
  removeCartItem,
  saleDiscount,
  setCartQuantity,
  walkInDiscountSchema,
  type CartLine,
  type Checkout,
  type SaleRecord,
  type WalkInDiscount
} from '@shared/sales'
import { availableUnits, piecesLabel, unitSellPrice, unitWord, type StockUnit } from '@shared/units'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { FiSearch, FiTrash2 } from 'react-icons/fi'
import Receipt from './Receipt'

/** Pharmacy clients buy through Wholesale; the counter lists retail customers only. */
const retailOnly = (people: CustomerProfile[]): CustomerProfile[] =>
  people.filter((person) => person.clientType !== 'pharmacy')

export default function SalesWorkspace(): ReactElement {
  const { account } = useAccount()
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [customers, setCustomers] = useState<CustomerProfile[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState<number | null>(null)
  // Note: A walk-in Senior/PWD sale keeps the ID details on the sale only; no profile is created.
  const [walkIn, setWalkIn] = useState<WalkInDiscount | null>(null)
  const [cash, setCash] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cashError, setCashError] = useState('')
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
      setCustomers(retailOnly(people))
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
          setCustomers(retailOnly(people))
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
  const walkInCheck = walkIn ? walkInDiscountSchema.safeParse(walkIn) : null
  const walkInErrors = Object.fromEntries(
    (walkInCheck?.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message])
  ) as Partial<Record<keyof WalkInDiscount, string>>
  // Note: Hold back "required" messages until the cashier starts typing; the total shows the hint.
  const shownWalkInError = (key: keyof WalkInDiscount): string | undefined =>
    walkIn && (walkIn[key] || (key === 'discountExpiresAt' && walkIn.discountType === 'pwd'))
      ? walkInErrors[key]
      : undefined
  const pricing = useMemo(() => {
    try {
      const customer = customers.find((item) => item.id === customerId) ?? null
      if (walkIn && !walkInDiscountSchema.safeParse(walkIn).success)
        return {
          totals: calculateSale(cart, 'none'),
          error: 'Complete the walk-in Senior/PWD ID details to apply the discount.'
        }
      return { totals: calculateSale(cart, saleDiscount(customer, walkIn)), error: '' }
    } catch (cause) {
      return {
        totals: calculateSale([], 'none'),
        error: cause instanceof Error ? cause.message : 'Invalid eligibility.'
      }
    }
  }, [cart, customers, customerId, walkIn])
  const changeQuantity = (batchId: number, quantity: number, unit: StockUnit): void => {
    setError('')
    try {
      const item = products.find((value) => value.batches.some((batch) => batch.id === batchId))
      const batch = item?.batches.find((value) => value.id === batchId)
      if (!item || !batch || !isBatchSellable(batch.stock, batch.expiresAt))
        throw new Error('This batch is unavailable or expired.')
      const price = unitSellPrice(unit, batch.sellPrice, batch.boxSellPrice, item.piecesPerBox)
      setCart(
        setCartQuantity(
          cart,
          { batchId, quantity, unit, unitPriceCents: priceToCents(price) },
          availableUnits(batch.stock, unit, item.piecesPerBox)
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
    setCashError('')
    setNotice('')
    try {
      if (pricing.error) throw new Error(pricing.error)
      if (!/^\d+(\.\d{1,2})?$/.test(cash)) {
        setCashError('Enter cash received with at most two decimal places.')
        return
      }
      if (priceToCents(Number(cash)) < pricing.totals.totalCents) {
        setCashError(`Cash received must be at least ${money(pricing.totals.totalCents)}.`)
        return
      }
      const values = {
        customerId,
        walkInDiscount: walkIn,
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
      setWalkIn(null)
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
    <DashboardShell pageTitle="Sales & Dispensing">
      <div className="space-y-5">
        <header className="page-intro flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Daily work</p>
            <h2 className="page-title mt-0.5">Sales &amp; Dispensing</h2>
            <p className="page-subtitle max-w-3xl">
              Search a medicine, add pieces or boxes to the cart, apply a Senior Citizen or PWD
              discount when eligible, then complete the sale.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              Refresh Stock
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => (history ? setHistory(null) : void loadHistory())}
            >
              {history
                ? 'Back to Checkout'
                : account?.role === 'master'
                  ? 'Transaction History'
                  : 'My Transactions'}
            </button>
          </div>
        </header>
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
        {history ? (
          <section className="panel space-y-3 p-5">
            <h3 className="section-title">Completed Transactions</h3>
            <p className="text-sm text-slate-500">
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
                    <tr className="border-t border-slate-100" key={sale.id}>
                      <td className="max-w-64 p-3 break-all">
                        {sale.reference}
                        <p>{new Date(sale.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="p-3">
                        {sale.customerName}
                        {sale.discountType !== 'none' && (
                          <p className="text-xs text-slate-500">
                            {sale.discountType === 'senior' ? 'Senior' : 'PWD'} ID {sale.discountId}
                            {sale.customerId === null ? ' · walk-in' : ''}
                          </p>
                        )}
                      </td>
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
                Load Older Transactions
              </button>
            )}
          </section>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
            <section className="panel min-w-0 space-y-4 p-5 sm:p-6">
              <div>
                <h3 className="section-title">1. Find the Medicine</h3>
                <p className="section-subtitle">
                  Pick a product, then add pieces or boxes from a batch.
                </p>
              </div>
              <label className="field-label">
                Search Medicines
                <span className="relative mt-1.5 block font-normal">
                  <FiSearch
                    aria-hidden="true"
                    className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    className="field pl-10"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Brand, generic name, category or formulation"
                  />
                </span>
              </label>
              {loading && <p role="status">Loading current stock…</p>}
              <div className="max-h-64 space-y-2 overflow-auto">
                {matches.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={selected === item.id}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border p-3 text-left transition-colors ${selected === item.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold break-words text-slate-900">
                        {item.brandName}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {item.genericName} · {item.formulation} · {item.category}
                      </span>
                    </span>
                    <span
                      className={`text-right text-sm font-semibold ${getSellableStock(item) ? 'text-slate-700' : 'text-rose-700'}`}
                    >
                      {getSellableStock(item)
                        ? `${piecesLabel(getSellableStock(item), item.piecesPerBox)} sellable`
                        : 'Out of stock'}
                    </span>
                  </button>
                ))}
                {!loading && !matches.length && <p>No matching products.</p>}
              </div>
              {product ? (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <h4 className="card-title break-words">{product.brandName} — Batches</h4>
                  <p className="text-sm text-slate-600">
                    Select the batch being dispensed.{' '}
                    {product.prescriptionRequired && (
                      <span className="font-semibold text-amber-800">Prescription required. </span>
                    )}
                    {product.controlled && (
                      <span className="font-semibold text-rose-700">Controlled medicine.</span>
                    )}
                  </p>
                  {product.batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="grid grid-cols-1 items-center gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_13.5rem]"
                    >
                      <div className="min-w-0 break-words">
                        <p className="font-semibold text-slate-900">{batch.batchNumber}</p>
                        <p className="text-sm text-slate-700">
                          {money(priceToCents(batch.sellPrice))} per piece
                          {product.piecesPerBox > 1 &&
                            ` · ${money(priceToCents(unitSellPrice('box', batch.sellPrice, batch.boxSellPrice, product.piecesPerBox)))} per box of ${product.piecesPerBox}`}
                        </p>
                        <p className="text-sm text-slate-600">
                          {piecesLabel(batch.stock, product.piecesPerBox)} on hand · Expires{' '}
                          {batch.expiresAt}
                        </p>
                        <p
                          className={`text-sm font-medium ${!isBatchSellable(batch.stock, batch.expiresAt) ? 'text-rose-700' : getExpiryStatus(batch.expiresAt) === 'near-expiry' ? 'text-amber-700' : 'text-slate-500'}`}
                        >
                          {expiryLabels[getExpiryStatus(batch.expiresAt)]}
                        </p>
                      </div>
                      {/* Note: Fixed-width button column so buttons line up whatever the batch text length. */}
                      <div className="grid grid-cols-2 gap-2 self-center">
                        {(product.piecesPerBox > 1
                          ? (['piece', 'box'] as const)
                          : (['piece'] as const)
                        ).map((unit) => {
                          const line = cart.find((item) => item.batchId === batch.id)
                          return (
                            <button
                              key={unit}
                              className={`${unit === 'piece' ? 'primary-button' : 'secondary-button'} w-full px-2 ${product.piecesPerBox > 1 ? '' : 'col-span-2'}`}
                              disabled={
                                busy ||
                                !isBatchSellable(batch.stock, batch.expiresAt) ||
                                availableUnits(batch.stock, unit, product.piecesPerBox) < 1
                              }
                              onClick={() =>
                                changeQuantity(
                                  batch.id,
                                  line && line.unit === unit ? line.quantity + 1 : 1,
                                  unit
                                )
                              }
                            >
                              {unit === 'piece' ? 'Add Piece' : 'Add Box'}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {!product.batches.length && (
                    <p className="text-sm font-medium text-rose-700">No stock batches recorded.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Select a product to view batch, expiry, and price details.
                </p>
              )}
            </section>
            <section className="panel min-w-0 space-y-4 p-5 sm:p-6">
              <div>
                <h3 className="section-title">2. Current Cart</h3>
                <p className="section-subtitle">
                  Set quantities, choose the customer, then take payment.
                </p>
              </div>
              {!cart.length && (
                <p className="text-sm text-slate-500">Add a product to start a transaction.</p>
              )}
              <div className="max-h-80 space-y-3 overflow-auto">
                {cart.map((line) => {
                  const item = products.find((value) =>
                    value.batches.some((batch) => batch.id === line.batchId)
                  )
                  const batch = item?.batches.find((value) => value.id === line.batchId)
                  const piecesPerBox = item?.piecesPerBox ?? 1
                  return (
                    <div
                      className="space-y-2 rounded-md border border-slate-200 p-3"
                      key={line.batchId}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 font-semibold break-words text-slate-900">
                          {item?.brandName ?? 'Unavailable product'}
                          <span className="block text-xs font-normal text-slate-500">
                            Batch {batch?.batchNumber}
                          </span>
                        </p>
                        <button
                          type="button"
                          className="icon-button size-9"
                          aria-label={`Remove ${item?.brandName ?? 'item'} from the cart`}
                          title="Remove from Cart"
                          disabled={busy}
                          onClick={() => setCart(removeCartItem(cart, line.batchId))}
                        >
                          <FiTrash2 aria-hidden="true" />
                        </button>
                      </div>
                      {/* Note: Labels sit above fixed-width inputs and the price has its own
                          right-hand column, so no text can slide under an input box. */}
                      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[5.5rem_9.5rem_minmax(0,1fr)]">
                        <label className="text-xs font-semibold text-slate-700">
                          Quantity
                          <input
                            aria-label={`Quantity for ${item?.brandName} batch ${batch?.batchNumber}`}
                            className="field mt-1"
                            type="number"
                            min="1"
                            max={
                              batch
                                ? availableUnits(batch.stock, line.unit, piecesPerBox)
                                : undefined
                            }
                            step="1"
                            value={line.quantity}
                            disabled={busy}
                            onChange={(event) =>
                              changeQuantity(line.batchId, Number(event.target.value), line.unit)
                            }
                          />
                        </label>
                        {piecesPerBox > 1 ? (
                          <label className="text-xs font-semibold text-slate-700">
                            Sold By
                            <select
                              aria-label={`Unit for ${item?.brandName} batch ${batch?.batchNumber}`}
                              className="field mt-1"
                              value={line.unit}
                              disabled={busy}
                              onChange={(event) =>
                                changeQuantity(line.batchId, 1, event.target.value as StockUnit)
                              }
                            >
                              <option value="piece">Piece</option>
                              <option value="box">Box of {piecesPerBox}</option>
                            </select>
                          </label>
                        ) : (
                          <p className="hidden pb-2.5 text-xs font-semibold text-slate-700 sm:block">
                            Sold by the piece
                          </p>
                        )}
                        <p className="col-span-2 text-right sm:col-span-1">
                          <span className="block text-xs text-slate-500">
                            {money(line.unitPriceCents)} per {unitWord(line.unit, piecesPerBox)}
                          </span>
                          <span className="block text-base font-bold text-slate-900 tabular-nums">
                            {money(line.unitPriceCents * line.quantity)}
                          </span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <label className="field-label">
                Customer
                <select
                  className="field mt-1.5 font-normal"
                  value={walkIn ? 'walk-in-discount' : (customerId ?? '')}
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value
                    setWalkIn(
                      value === 'walk-in-discount'
                        ? {
                            discountType: 'senior',
                            holderName: '',
                            discountId: '',
                            discountExpiresAt: null
                          }
                        : null
                    )
                    setCustomerId(value && value !== 'walk-in-discount' ? Number(value) : null)
                  }}
                >
                  <option value="">Walk-in Customer (No Discount)</option>
                  <option value="walk-in-discount">Walk-in Senior Citizen / PWD (Enter ID)</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.fullName} ·{' '}
                      {customer.discountType === 'none'
                        ? 'Regular'
                        : customer.discountType === 'senior'
                          ? 'Senior Citizen'
                          : 'PWD'}
                    </option>
                  ))}
                </select>
              </label>
              {walkIn && (
                <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-bold">
                    Walk-in Senior Citizen / PWD ID
                  </legend>
                  <p className="text-xs text-slate-500">
                    Check the physical ID. The name, ID number and expiry are saved with this sale
                    and printed on the receipt.
                  </p>
                  <label className="field-label">
                    ID Type<span className="required-mark">*</span>
                    <select
                      className="field mt-1.5 font-normal"
                      value={walkIn.discountType}
                      disabled={busy}
                      onChange={(event) =>
                        setWalkIn({
                          ...walkIn,
                          discountType: event.target.value as WalkInDiscount['discountType']
                        })
                      }
                    >
                      <option value="senior">Senior Citizen</option>
                      <option value="pwd">PWD</option>
                    </select>
                  </label>
                  {(
                    [
                      ['holderName', 'Name on ID', 'personName'],
                      ['discountId', 'ID Number', 'discountId']
                    ] as const
                  ).map(([key, label, rule]) => (
                    <label className="field-label" key={key}>
                      {label}
                      <span className="required-mark">*</span>
                      <span className="mt-1.5 block font-normal">
                        <FilteredInput
                          rule={rule}
                          maxLength={key === 'discountId' ? 40 : 120}
                          value={walkIn[key]}
                          disabled={busy}
                          aria-invalid={!!shownWalkInError(key)}
                          onValueChange={(value) => setWalkIn({ ...walkIn, [key]: value })}
                        />
                      </span>
                      {shownWalkInError(key) && (
                        <span className="field-error font-normal">{shownWalkInError(key)}</span>
                      )}
                    </label>
                  ))}
                  <label className="field-label">
                    {walkIn.discountType === 'pwd'
                      ? 'ID Expiry Date'
                      : 'ID Expiry Date (If Printed)'}
                    {walkIn.discountType === 'pwd' && <span className="required-mark">*</span>}
                    <input
                      className="field mt-1.5 font-normal"
                      type="date"
                      min={localDate()}
                      value={walkIn.discountExpiresAt ?? ''}
                      disabled={busy}
                      aria-invalid={!!shownWalkInError('discountExpiresAt')}
                      onChange={(event) =>
                        setWalkIn({ ...walkIn, discountExpiresAt: event.target.value || null })
                      }
                    />
                    {shownWalkInError('discountExpiresAt') && (
                      <span className="field-error font-normal">
                        {shownWalkInError('discountExpiresAt')}
                      </span>
                    )}
                  </label>
                </fieldset>
              )}
              <p className="text-xs text-slate-500">
                Senior Citizen and PWD eligibility (registered profile or walk-in ID) removes the
                12% VAT, then applies a 20% discount.
              </p>
              {pricing.error && (
                <p role="alert" className="text-sm font-medium text-rose-700">
                  {pricing.error}
                </p>
              )}
              <dl className="space-y-2 rounded-md bg-slate-50 p-4">
                <div className="flex justify-between gap-3">
                  <dt>Subtotal</dt>
                  <dd>{money(pricing.totals.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Less VAT (12%)</dt>
                  <dd>−{money(pricing.totals.vatExemptionCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Discount</dt>
                  <dd>−{money(pricing.totals.discountCents)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-300 pt-3 text-xl font-bold">
                  <dt>Total Due</dt>
                  <dd>{money(pricing.totals.totalCents)}</dd>
                </div>
              </dl>
              <label className="field-label">
                Cash Received (₱)<span className="required-mark">*</span>
                <input
                  className="field mt-1.5 font-normal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cash}
                  disabled={busy}
                  aria-invalid={cashError ? true : undefined}
                  aria-describedby={cashError ? 'cash-error' : undefined}
                  onChange={(event) => {
                    setCash(event.target.value)
                    setCashError('')
                  }}
                />
                {cashError && (
                  <span id="cash-error" className="field-error">
                    {cashError}
                  </span>
                )}
              </label>
              <p className="text-lg font-bold">
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
                  {busy ? 'Processing…' : 'Complete Cash Payment'}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || !cart.length}
                  onClick={() => {
                    setCart([])
                    setCash('')
                    setCustomerId(null)
                    setWalkIn(null)
                    pending.current = null
                    setError('')
                    setNotice('Cart cancelled. No payment or stock change was recorded.')
                  }}
                >
                  Cancel Transaction
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
