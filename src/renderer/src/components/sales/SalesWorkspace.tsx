import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { useConfirm } from '@renderer/components/ui/ConfirmDialog'
import FilteredInput from '@renderer/components/ui/FilteredInput'
import InfoTip from '@renderer/components/ui/InfoTip'
import { getSellableStock, type CustomerProfile, type ItemProfile } from '@renderer/data/profiles'
import { useAccount } from '@renderer/hooks/useAccount'
import { getCustomers, getProducts } from '@renderer/services/profiles'
import { completeSale, getSale, getSaleHistory } from '@renderer/services/sales'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { customerDetail } from '@shared/controls'
import { phoneKey } from '@shared/duplicates'
import {
  expiryDateLabel,
  expiryLabels,
  getExpiryStatus,
  isBatchSellable,
  localDate
} from '@shared/inventory'
import {
  calculateSale,
  cartKey,
  missingRegisterFields,
  money,
  posPaymentMethods,
  priceToCents,
  removeCartItem,
  saleDiscount,
  setCartQuantity,
  walkInDiscountSchema,
  type CartLine,
  type Checkout,
  type PosPaymentMethod,
  type Prescription,
  type SaleHistoryRecord,
  type SaleRecord,
  type WalkInDiscount
} from '@shared/sales'
import { availableUnits, piecesLabel, unitSellPrice, unitWord, type StockUnit } from '@shared/units'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { FiDollarSign, FiSearch, FiSlash, FiTrash2 } from 'react-icons/fi'
import CashCountDialog from './CashCountDialog'
import Receipt from './Receipt'
import VoidSaleDialog from './VoidSaleDialog'

/** Pharmacy clients buy through Wholesale; the counter lists retail customers only. */
const retailOnly = (people: CustomerProfile[]): CustomerProfile[] =>
  people.filter((person) => person.clientType !== 'pharmacy')

const emptyPrescription: Prescription = {
  prescriberName: '',
  prescriberLicense: '',
  prescriptionNumber: '',
  patientName: '',
  patientAge: null,
  patientAddress: '',
  prescriberAddress: '',
  prescriberS2License: ''
}

/**
 * Stock the counter may sell: pieces promised to undelivered wholesale orders are still on the
 * shelf but are kept for the pharmacy client, so the POS works with what is left (`stock` here
 * is the free stock; `reserved` keeps the promised pieces for the batch card).
 */
const forCounter = (items: ItemProfile[]): ItemProfile[] =>
  items.map((item) => ({
    ...item,
    batches: item.batches.map((batch) => ({
      ...batch,
      stock: Math.max(0, batch.stock - batch.reserved)
    }))
  }))

/** "Sell first": the sellable batch that expires soonest (batches arrive sorted by expiry). */
const firstSellable = (item: ItemProfile): number | undefined =>
  item.batches.find((batch) => isBatchSellable(batch.stock, batch.expiresAt))?.id

/**
 * Stock shown on a POS product card. Pieces that are only in expired batches are on the shelf but
 * cannot be sold, so they read "Expired" with a write-off hint instead of "Out of stock" (L12).
 */
function stockLabel(item: ItemProfile): string {
  const sellable = getSellableStock(item)
  if (sellable) return `${sellable} pcs sellable`
  const expired = item.batches
    .filter((batch) => batch.stock > 0 && getExpiryStatus(batch.expiresAt) === 'expired')
    .reduce((total, batch) => total + batch.stock, 0)
  if (expired) return `Expired: ${expired} pcs to write off`
  const promised = item.batches.reduce((total, batch) => total + batch.reserved, 0)
  return promised ? `All promised to wholesale (${promised} pcs)` : 'Out of stock'
}

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
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('Cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [prescription, setPrescription] = useState<Prescription>(emptyPrescription)
  const [customerQuery, setCustomerQuery] = useState('')
  const [voiding, setVoiding] = useState<Omit<SaleRecord, 'items'> | null>(null)
  const [cashCount, setCashCount] = useState(false)
  const [confirmDialog, confirm] = useConfirm()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cashError, setCashError] = useState('')
  const [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState<SaleRecord | null>(null)
  const [history, setHistory] = useState<SaleHistoryRecord[] | null>(null)
  const [more, setMore] = useState(false)
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const paying = useRef(false)
  const fail = (cause: unknown): void =>
    setError(cause instanceof Error ? cause.message : 'Unable to load sales data.')
  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      const [items, people] = await Promise.all([getProducts(), getCustomers()])
      setProducts(forCounter(items))
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
          setProducts(forCounter(items))
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
  const changeQuantity = (
    batchId: number,
    quantity: number,
    unit: StockUnit,
    base: CartLine[] = cart
  ): void => {
    setError('')
    try {
      const item = products.find((value) => value.batches.some((batch) => batch.id === batchId))
      const batch = item?.batches.find((value) => value.id === batchId)
      if (!item || !batch || !isBatchSellable(batch.stock, batch.expiresAt))
        throw new Error('This batch is unavailable or expired.')
      const price = unitSellPrice(unit, batch.sellPrice, batch.boxSellPrice, batch.piecesPerBox)
      setCart(
        setCartQuantity(
          base,
          { batchId, quantity, unit, unitPriceCents: priceToCents(price) },
          availableUnits(batch.stock - otherPieces(base, batchId, unit), unit, batch.piecesPerBox)
        )
      )
    } catch (cause) {
      fail(cause)
    }
  }
  /** Pieces already in the cart from the same batch under the other unit (box or piece). */
  const otherPieces = (base: CartLine[], batchId: number, unit: StockUnit): number => {
    const piecesPerBox =
      products.flatMap((value) => value.batches).find((batch) => batch.id === batchId)
        ?.piecesPerBox ?? 1
    return base
      .filter((line) => line.batchId === batchId && line.unit !== unit)
      .reduce((total, line) => total + line.quantity * (line.unit === 'box' ? piecesPerBox : 1), 0)
  }
  // Note: Prescription (Rx) and controlled medicines need the prescription recorded at checkout.
  const cartProducts = products.filter((item) =>
    item.batches.some((batch) => cart.some((line) => line.batchId === batch.id))
  )
  const rxProducts = cartProducts.filter((item) => item.prescriptionRequired || item.controlled)
  const controlledProducts = cartProducts.filter((item) => item.controlled)
  const eWallet = paymentMethod !== 'Cash'
  const resetPayment = (): void => {
    setCash('')
    setPaymentMethod('Cash')
    setPaymentReference('')
    setPrescription(emptyPrescription)
    setCustomerQuery('')
  }
  /**
   * Adds from a batch. Soonest expiry is sold first (FEFO); choosing a batch that expires later
   * asks the cashier to confirm, e.g. when the customer asked for a longer expiry.
   */
  const addFromBatch = async (
    item: ItemProfile,
    batchId: number,
    unit: StockUnit
  ): Promise<void> => {
    const first = firstSellable(item)
    const line = cart.find((value) => value.batchId === batchId && value.unit === unit)
    const earlier = item.batches.find((batch) => batch.id === first)
    if (first !== undefined && first !== batchId && !line && earlier) {
      const accepted = await confirm({
        title: 'Sell a later-expiring batch?',
        message: (
          <>
            Batch <strong>{earlier.batchNumber}</strong> expires sooner ({earlier.expiresAt}) and
            should be sold first. Use this later batch only if there is a reason, e.g. the customer
            needs a longer expiry.
          </>
        ),
        confirmLabel: 'Use This Batch',
        cancelLabel: 'Go back'
      })
      if (!accepted) return
    }
    changeQuantity(batchId, line ? line.quantity + 1 : 1, unit)
  }
  /** Quick add from the soonest-expiring batch that still has enough stock for the unit. */
  const quickAdd = (item: ItemProfile, unit: StockUnit): void => {
    const inCart = (batchId: number, piecesPerBox: number): number =>
      cart
        .filter((line) => line.batchId === batchId)
        .reduce((sum, line) => sum + line.quantity * (line.unit === 'box' ? piecesPerBox : 1), 0)
    const batch = item.batches.find(
      (value) =>
        isBatchSellable(value.stock, value.expiresAt) &&
        availableUnits(
          value.stock - inCart(value.id, value.piecesPerBox),
          unit,
          value.piecesPerBox
        ) >= 1
    )
    if (!batch) {
      setError(`No ${unit === 'box' ? 'whole box' : 'piece'} of ${item.brandName} is left to sell.`)
      return
    }
    const line = cart.find((value) => value.batchId === batch.id && value.unit === unit)
    changeQuantity(batch.id, line ? line.quantity + 1 : 1, unit)
  }
  const shownCustomers = useMemo(() => {
    const term = customerQuery.trim().toLowerCase()
    if (!term) return customers
    const digits = phoneKey(term)
    return customers.filter(
      (customer) =>
        customer.fullName.toLowerCase().includes(term) ||
        (digits.length >= 3 && phoneKey(customer.phone).includes(digits)) ||
        customer.discountId.toLowerCase().includes(term)
    )
  }, [customers, customerQuery])
  const chosenCustomer = customers.find((item) => item.id === customerId)
  const pay = async (): Promise<void> => {
    if (paying.current) return
    paying.current = true
    setBusy(true)
    setError('')
    setCashError('')
    setNotice('')
    try {
      if (pricing.error) throw new Error(pricing.error)
      const received = eWallet ? (pricing.totals.totalCents / 100).toFixed(2) : cash
      if (!/^\d+(\.\d{1,2})?$/.test(received)) {
        setCashError('Enter cash received with at most two decimal places.')
        return
      }
      if (priceToCents(Number(received)) < pricing.totals.totalCents) {
        setCashError(`Cash received must be at least ${money(pricing.totals.totalCents)}.`)
        return
      }
      if (eWallet && !paymentReference.trim()) {
        setCashError(`Enter the ${paymentMethod} reference number from the customer's app.`)
        return
      }
      // Note: A registered customer's saved address is used when the patient address is left empty.
      const filled: Prescription = {
        ...prescription,
        patientAddress: prescription.patientAddress?.trim() || chosenCustomer?.address || ''
      }
      if (rxProducts.length) {
        if (
          prescription.prescriberName.trim().length < 2 ||
          prescription.prescriberLicense.trim().length < 4
        ) {
          setCashError("Enter the prescribing doctor's name and PRC license number.")
          return
        }
        if (controlledProducts.length) {
          const missing = missingRegisterFields(
            {
              ...emptyPrescription,
              ...filled,
              prescriptionNumber: prescription.prescriptionNumber?.trim() ?? '',
              patientName: prescription.patientName?.trim() ?? '',
              patientAddress: filled.patientAddress ?? '',
              prescriberAddress: prescription.prescriberAddress?.trim() ?? '',
              prescriberS2License: prescription.prescriberS2License?.trim() ?? '',
              patientAge: prescription.patientAge ?? null
            },
            customerId !== null || !!walkIn
          )
          if (missing.length) {
            setCashError(`Controlled medicine: enter the ${missing.join(', ')}.`)
            return
          }
        }
      }
      const values = {
        customerId,
        walkInDiscount: walkIn,
        items: cart,
        expectedTotalCents: pricing.totals.totalCents,
        cashCents: priceToCents(Number(received)),
        paymentMethod,
        paymentReference: eWallet ? paymentReference.trim() : null,
        prescription: rxProducts.length ? filled : null
      }
      const fingerprint = JSON.stringify(values)
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, requestId: crypto.randomUUID() }
      const data: Checkout = { ...values, requestId: pending.current.requestId }
      const saved = await completeSale(data)
      setReceipt(saved)
      setCart([])
      resetPayment()
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
            <div className="flex items-center gap-1.5">
              <h1 className="page-title mt-0.5">Sales &amp; Dispensing</h1>
              <InfoTip label="Sales & Dispensing">
                Search a medicine, add pieces or boxes to the cart, apply a Senior Citizen or PWD
                discount when eligible, then complete the sale.
              </InfoTip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              Refresh Stock
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => setCashCount(true)}>
              <FiDollarSign aria-hidden="true" /> End-of-Day Cash Count
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
            <h3 className="section-title">Transactions</h3>
            <p className="text-sm text-slate-500">
              Newest first · {account?.role === 'master' ? 'All cashiers' : 'Your sales only'}. A
              sale of today rung up wrong can be voided before the drawer is counted; it is left out
              of totals.{' '}
              {account?.role === 'master' ? '' : 'An administrator must approve each void.'}
            </p>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr>
                    {['Reference / date', 'Customer', 'Cashier', 'Total', 'Actions'].map(
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
                    <tr
                      className={`border-t border-slate-100 ${sale.status === 'voided' ? 'bg-slate-50 text-slate-500' : ''}`}
                      key={sale.id}
                    >
                      <td className="max-w-64 p-3 break-all">
                        {sale.reference}
                        <p>{new Date(sale.createdAt).toLocaleString()}</p>
                        {sale.status === 'voided' && (
                          <p className="mt-1 text-xs font-semibold break-words text-rose-700">
                            <span className="rounded border border-rose-300 px-1.5 py-0.5">
                              VOID
                            </span>{' '}
                            {sale.voidReason} · by {sale.voidedByName}
                            {sale.voidApprovedByName &&
                            sale.voidApprovedByName !== sale.voidedByName
                              ? `, approved by ${sale.voidApprovedByName}`
                              : ''}
                          </p>
                        )}
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
                      <td className={`p-3 ${sale.status === 'voided' ? 'line-through' : ''}`}>
                        {money(sale.totalCents)}
                        <p className="text-sm text-slate-600">
                          {sale.paymentMethod ?? 'Cash'}
                          {sale.paymentReference ? ` · Ref ${sale.paymentReference}` : ''}
                        </p>
                      </td>
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
                        {/* Note: Only today's sales can be voided; older days are closed (M2),
                            and so is a sale whose drawer was already counted after it. */}
                        {sale.status === 'completed' &&
                          !sale.drawerCounted &&
                          localDate(new Date(sale.createdAt)) === localDate() && (
                            <button
                              className="secondary-button ml-2 text-rose-700"
                              disabled={busy}
                              onClick={() => setVoiding(sale)}
                            >
                              <FiSlash aria-hidden="true" /> Void
                            </button>
                          )}
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
                <div className="flex items-center gap-1.5">
                  <h3 className="section-title">1. Find the Medicine</h3>
                  <InfoTip label="1. Find the Medicine">
                    Pick a product, then add pieces or boxes from a batch.
                  </InfoTip>
                </div>
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
                      {stockLabel(item)}
                    </span>
                  </button>
                ))}
                {!loading && !matches.length && <p>No matching products.</p>}
              </div>
              {product ? (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <h4 className="card-title break-words">{product.brandName} — Batches</h4>
                  <p className="text-sm text-slate-600">
                    Batches are listed soonest expiry first; sell the batch marked “Sell first”.{' '}
                    {product.prescriptionRequired && (
                      <span className="font-semibold text-amber-800">Prescription required. </span>
                    )}
                    {product.controlled && (
                      <span className="font-semibold text-rose-700">
                        Controlled medicine: recorded in the dangerous drugs register.
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="primary-button"
                      disabled={busy || firstSellable(product) === undefined}
                      onClick={() => quickAdd(product, 'piece')}
                    >
                      Add Piece (Sell First)
                    </button>
                    {product.batches.some(
                      (batch) =>
                        batch.piecesPerBox > 1 && isBatchSellable(batch.stock, batch.expiresAt)
                    ) && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => quickAdd(product, 'box')}
                      >
                        Add Box (Sell First)
                      </button>
                    )}
                  </div>
                  {product.batches.map((batch) => (
                    <div
                      key={batch.id}
                      className={`grid grid-cols-1 items-center gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_13.5rem] ${firstSellable(product) === batch.id ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200'}`}
                    >
                      <div className="min-w-0 break-words">
                        <p className="font-semibold text-slate-900">
                          {batch.batchNumber}
                          {firstSellable(product) === batch.id && (
                            <span className="bg-brand-700 ml-2 rounded px-1.5 py-0.5 text-xs font-semibold text-white">
                              Sell first
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-slate-700">
                          {money(priceToCents(batch.sellPrice))} per piece
                          {batch.piecesPerBox > 1 &&
                            ` · ${money(priceToCents(unitSellPrice('box', batch.sellPrice, batch.boxSellPrice, batch.piecesPerBox)))} per box of ${batch.piecesPerBox}`}
                        </p>
                        <p className="text-sm text-slate-600">
                          {batch.reserved > 0
                            ? `${piecesLabel(batch.stock, batch.piecesPerBox)} free to sell · ${batch.reserved} pcs promised to wholesale`
                            : `${piecesLabel(batch.stock, batch.piecesPerBox)} on hand`}{' '}
                          ·{' '}
                          <span className="whitespace-nowrap">
                            Expires {expiryDateLabel(batch.expiresAt)}
                          </span>
                        </p>
                        <p
                          className={`text-sm font-medium ${!isBatchSellable(batch.stock, batch.expiresAt) ? 'text-rose-700' : getExpiryStatus(batch.expiresAt) === 'near-expiry' ? 'text-amber-700' : 'text-slate-500'}`}
                        >
                          {expiryLabels[getExpiryStatus(batch.expiresAt)]}
                        </p>
                      </div>
                      {/* Note: Fixed-width button column so buttons line up whatever the batch text length. */}
                      <div className="grid grid-cols-2 gap-2 self-center">
                        {(batch.piecesPerBox > 1
                          ? (['piece', 'box'] as const)
                          : (['piece'] as const)
                        ).map((unit) => (
                          <button
                            key={unit}
                            className={`${unit === 'piece' ? 'primary-button' : 'secondary-button'} w-full px-2 ${batch.piecesPerBox > 1 ? '' : 'col-span-2'}`}
                            disabled={
                              busy ||
                              !isBatchSellable(batch.stock, batch.expiresAt) ||
                              availableUnits(batch.stock, unit, batch.piecesPerBox) < 1
                            }
                            onClick={() => void addFromBatch(product, batch.id, unit)}
                          >
                            {unit === 'piece' ? 'Add Piece' : 'Add Box'}
                          </button>
                        ))}
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
                <div className="flex items-center gap-1.5">
                  <h3 className="section-title">2. Current Cart</h3>
                  <InfoTip label="2. Current Cart">
                    Set quantities, choose the customer, then take payment.
                  </InfoTip>
                </div>
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
                  const piecesPerBox = batch?.piecesPerBox ?? 1
                  return (
                    <div
                      className="space-y-2 rounded-md border border-slate-200 p-3"
                      key={cartKey(line)}
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
                          onClick={() => setCart(removeCartItem(cart, cartKey(line)))}
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
                                ? availableUnits(
                                    batch.stock - otherPieces(cart, line.batchId, line.unit),
                                    line.unit,
                                    piecesPerBox
                                  )
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
                              onChange={(event) => {
                                const unit = event.target.value as StockUnit
                                const rest = removeCartItem(cart, cartKey(line))
                                const same = rest.find(
                                  (value) => value.batchId === line.batchId && value.unit === unit
                                )
                                changeQuantity(line.batchId, (same?.quantity ?? 0) + 1, unit, rest)
                              }}
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
              <div className="space-y-2">
                <label className="field-label" htmlFor="customer-search">
                  Customer
                </label>
                <span className="relative block">
                  <FiSearch
                    aria-hidden="true"
                    className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="customer-search"
                    className="field mt-0 pl-10"
                    value={customerQuery}
                    disabled={busy}
                    placeholder="Search name, mobile number or Senior/PWD ID"
                    onChange={(event) => setCustomerQuery(event.target.value)}
                  />
                </span>
                <select
                  className="field mt-0 font-normal"
                  aria-label="Choose customer"
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
                  {chosenCustomer && !shownCustomers.includes(chosenCustomer) && (
                    <option value={chosenCustomer.id}>
                      {chosenCustomer.fullName} ·{' '}
                      {customerDetail({
                        ...chosenCustomer,
                        discountId: chosenCustomer.discountId || null,
                        address: chosenCustomer.address || null
                      })}
                    </option>
                  )}
                  {shownCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.fullName} ·{' '}
                      {customer.discountType === 'none'
                        ? 'Regular'
                        : customer.discountType === 'senior'
                          ? 'Senior Citizen'
                          : 'PWD'}{' '}
                      ·{' '}
                      {customerDetail({
                        ...customer,
                        discountId: customer.discountId || null,
                        address: customer.address || null
                      })}
                    </option>
                  ))}
                </select>
                {customerQuery && (
                  <p className="text-xs text-slate-500" role="status">
                    {shownCustomers.length} matching customer
                    {shownCustomers.length === 1 ? '' : 's'}. Customers with the same name are told
                    apart by mobile number or ID.
                  </p>
                )}
              </div>
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
              <p className="flex items-center gap-1 text-sm text-slate-600">
                Senior Citizen / PWD: VAT removed, then 20% off.
                <InfoTip label="Senior Citizen and PWD discount">
                  Senior Citizen and PWD eligibility (registered profile or walk-in ID) removes the
                  12% VAT, then applies a 20% discount.
                </InfoTip>
              </p>
              {rxProducts.length > 0 && (
                <fieldset className="space-y-3 rounded-md border border-amber-300 bg-amber-50/60 p-3">
                  <legend className="px-1 text-sm font-bold text-amber-900">
                    Prescription Details
                  </legend>
                  <p className="text-sm text-amber-900">
                    {rxProducts.map((item) => item.brandName).join(', ')}{' '}
                    {rxProducts.length === 1 ? 'needs' : 'need'} a prescription. Check the
                    prescription, then record the prescribing doctor.
                    {controlledProducts.length > 0 &&
                      ' Controlled medicine: the dangerous drugs register also needs the prescription (SPFDD) number, the patient and the doctor’s S2 license.'}
                  </p>
                  <label className="field-label">
                    Prescribing Doctor<span className="required-mark">*</span>
                    <span className="mt-1.5 block font-normal">
                      <FilteredInput
                        rule="personName"
                        maxLength={120}
                        value={prescription.prescriberName}
                        disabled={busy}
                        placeholder="e.g. Dr. Ana Reyes"
                        onValueChange={(value) =>
                          setPrescription({ ...prescription, prescriberName: value })
                        }
                      />
                    </span>
                  </label>
                  <label className="field-label">
                    PRC License No.<span className="required-mark">*</span>
                    <span className="mt-1.5 block font-normal">
                      <FilteredInput
                        rule="reference"
                        maxLength={40}
                        value={prescription.prescriberLicense}
                        disabled={busy}
                        placeholder="e.g. 0123456"
                        onValueChange={(value) =>
                          setPrescription({ ...prescription, prescriberLicense: value })
                        }
                      />
                    </span>
                  </label>
                  <label className="field-label">
                    {controlledProducts.length > 0
                      ? 'Prescription (SPFDD) No.'
                      : 'Prescription No.'}
                    {controlledProducts.length > 0 ? (
                      <span className="required-mark">*</span>
                    ) : (
                      <span className="ml-1 text-sm font-normal text-slate-600">(optional)</span>
                    )}
                    <span className="mt-1.5 block font-normal">
                      <FilteredInput
                        rule="reference"
                        maxLength={60}
                        value={prescription.prescriptionNumber ?? ''}
                        disabled={busy}
                        onValueChange={(value) =>
                          setPrescription({ ...prescription, prescriptionNumber: value })
                        }
                      />
                    </span>
                  </label>
                  {controlledProducts.length > 0 && (
                    <div className="grid gap-3 border-t border-amber-200 pt-3 sm:grid-cols-2">
                      <p className="text-xs text-amber-900 sm:col-span-2">
                        Dangerous drugs register (DDB form 1-14). The patient’s name is the{' '}
                        {customerId !== null || walkIn ? 'selected customer' : 'name below'}.
                      </p>
                      {customerId === null && !walkIn && (
                        <label className="field-label sm:col-span-2">
                          Patient Name<span className="required-mark">*</span>
                          <span className="mt-1.5 block font-normal">
                            <FilteredInput
                              rule="personName"
                              maxLength={120}
                              value={prescription.patientName ?? ''}
                              disabled={busy}
                              onValueChange={(value) =>
                                setPrescription({ ...prescription, patientName: value })
                              }
                            />
                          </span>
                        </label>
                      )}
                      <label className="field-label">
                        Patient Age<span className="required-mark">*</span>
                        <input
                          className="field mt-1.5 font-normal"
                          type="number"
                          min="0"
                          max="130"
                          step="1"
                          value={prescription.patientAge ?? ''}
                          disabled={busy}
                          onChange={(event) =>
                            setPrescription({
                              ...prescription,
                              patientAge:
                                event.target.value === '' ? null : Number(event.target.value)
                            })
                          }
                        />
                      </label>
                      <label className="field-label">
                        Doctor’s S2 License No.<span className="required-mark">*</span>
                        <span className="mt-1.5 block font-normal">
                          <FilteredInput
                            rule="reference"
                            maxLength={40}
                            value={prescription.prescriberS2License ?? ''}
                            disabled={busy}
                            onValueChange={(value) =>
                              setPrescription({ ...prescription, prescriberS2License: value })
                            }
                          />
                        </span>
                      </label>
                      <label className="field-label sm:col-span-2">
                        Patient Address<span className="required-mark">*</span>
                        <input
                          className="field mt-1.5 font-normal"
                          maxLength={300}
                          value={prescription.patientAddress ?? ''}
                          placeholder={chosenCustomer?.address || 'e.g. Purok 2, Koronadal City'}
                          disabled={busy}
                          onChange={(event) =>
                            setPrescription({ ...prescription, patientAddress: event.target.value })
                          }
                        />
                      </label>
                      <label className="field-label sm:col-span-2">
                        Doctor’s Clinic Address<span className="required-mark">*</span>
                        <input
                          className="field mt-1.5 font-normal"
                          maxLength={300}
                          value={prescription.prescriberAddress ?? ''}
                          disabled={busy}
                          onChange={(event) =>
                            setPrescription({
                              ...prescription,
                              prescriberAddress: event.target.value
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                </fieldset>
              )}
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
                Payment Method<span className="required-mark">*</span>
                <select
                  className="field mt-1.5 font-normal"
                  value={paymentMethod}
                  disabled={busy}
                  onChange={(event) => {
                    setPaymentMethod(event.target.value as PosPaymentMethod)
                    setCashError('')
                  }}
                >
                  {posPaymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              {eWallet ? (
                <label className="field-label">
                  {paymentMethod} Reference No.<span className="required-mark">*</span>
                  <span className="mt-1.5 block font-normal">
                    <FilteredInput
                      rule="reference"
                      maxLength={60}
                      value={paymentReference}
                      disabled={busy}
                      placeholder="From the customer's payment confirmation"
                      aria-invalid={cashError ? true : undefined}
                      aria-describedby={cashError ? 'cash-error' : undefined}
                      onValueChange={(value) => {
                        setPaymentReference(value)
                        setCashError('')
                      }}
                    />
                  </span>
                  <span className="mt-1 block text-sm font-normal text-slate-600">
                    Amount received: {money(pricing.totals.totalCents)} (exact amount, no change).
                  </span>
                </label>
              ) : (
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
                </label>
              )}
              {cashError && (
                <p id="cash-error" role="alert" className="field-error">
                  {cashError}
                </p>
              )}
              {!eWallet && (
                <p className="text-lg font-bold">
                  Change:{' '}
                  {money(
                    Math.max(0, Math.round((Number(cash) || 0) * 100) - pricing.totals.totalCents)
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="primary-button"
                  disabled={busy || loading || !cart.length || !!pricing.error}
                  onClick={() => void pay()}
                >
                  {busy ? 'Processing…' : `Complete ${paymentMethod} Payment`}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || !cart.length}
                  onClick={() => {
                    setCart([])
                    resetPayment()
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
        {voiding && (
          <VoidSaleDialog
            sale={voiding}
            needsApproval={account?.role !== 'master'}
            close={() => setVoiding(null)}
            voided={async (sale) => {
              setVoiding(null)
              setNotice(`${sale.reference} voided. Its items are back in stock.`)
              setReceipt(sale)
              useProfileStore.getState().reset()
              await Promise.all([loadHistory(), refresh()])
            }}
          />
        )}
        {cashCount && (
          <CashCountDialog
            close={() => {
              setCashCount(false)
              // Note: A saved count closes voids for earlier sales, so the open list is reloaded.
              if (history) void loadHistory()
            }}
          />
        )}
        {confirmDialog}
      </div>
    </DashboardShell>
  )
}
