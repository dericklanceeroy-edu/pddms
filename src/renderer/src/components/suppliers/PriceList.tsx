import FormField, { FormError, RequiredNote } from '@renderer/components/ui/FormField'
import { TitleWithInfo } from '@renderer/components/ui/InfoTip'
import Modal from '@renderer/components/ui/Modal'
import { EmptyState } from '@renderer/components/ui/PageHeader'
import { splitErrors, type FieldErrors } from '@renderer/components/ui/fieldErrors'
import type { ItemProfile } from '@renderer/data/profiles'
import {
  createPack,
  getPriceDifferences,
  getPriceList,
  setPackArchived,
  updatePackPrice
} from '@renderer/services/controls'
import type { PriceDifferenceRecord, SupplierPackRecord } from '@shared/controls'
import { filterInput } from '@shared/inputRules'
import { localDate } from '@shared/inventory'
import type { Supplier } from '@shared/types'
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { FiArchive, FiClock, FiPlus, FiRotateCcw, FiTag, FiTruck } from 'react-icons/fi'

const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })
const showDate = (value: string): string => date.format(new Date(`${value.slice(0, 10)}T00:00:00`))

/**
 * Supplier price list: the cost per box each supplier agreed to (from their quotation), per
 * product and pack size. Purchase orders take the cost from here; staff placing orders can see the
 * list but only the owner/administrator can change it. Differences found at receiving are listed
 * so the administrator can update the list.
 */
export default function PriceList({
  suppliers,
  products,
  canEdit,
  query,
  feedback
}: {
  suppliers: Supplier[]
  products: ItemProfile[]
  canEdit: boolean
  query: string
  feedback: (message: string, tone?: 'success' | 'error') => void
}): ReactElement {
  const [packs, setPacks] = useState<SupplierPackRecord[]>([])
  const [differences, setDifferences] = useState<PriceDifferenceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState<Partial<NewPackDraft> | null>(null)
  const [pricing, setPricing] = useState<{ pack: SupplierPackRecord; cost?: number } | null>(null)
  const [history, setHistory] = useState<number | null>(null)
  const fetchLists = useCallback(
    () =>
      Promise.all([getPriceList(), canEdit ? getPriceDifferences() : Promise.resolve([])])
        .then(([list, found]) => {
          setPacks(list)
          setDifferences(found)
        })
        .catch((cause: unknown) =>
          feedback(
            cause instanceof Error ? cause.message : 'Unable to load the price list.',
            'error'
          )
        )
        .finally(() => setLoading(false)),
    [canEdit, feedback]
  )
  const load = async (): Promise<void> => {
    setLoading(true)
    await fetchLists()
  }
  useEffect(() => {
    void fetchLists()
  }, [fetchLists])
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase()
    return packs.filter(
      (pack) =>
        (showArchived || !pack.isArchived) &&
        (!term ||
          `${pack.supplierName} ${pack.productName} ${pack.current?.quotationReference ?? ''}`
            .toLowerCase()
            .includes(term))
    )
  }, [packs, query, showArchived])
  const bySupplier = useMemo(() => {
    const groups = new Map<string, SupplierPackRecord[]>()
    for (const pack of shown)
      groups.set(pack.supplierName, [...(groups.get(pack.supplierName) ?? []), pack])
    return [...groups.entries()]
  }, [shown])
  const toggleArchive = async (pack: SupplierPackRecord): Promise<void> => {
    try {
      await setPackArchived(pack.id, !pack.isArchived)
      feedback(
        pack.isArchived
          ? `${pack.productName}, box of ${pack.piecesPerBox}, is back on the price list.`
          : `${pack.productName}, box of ${pack.piecesPerBox}, removed from new orders. Its history is kept.`
      )
      await load()
    } catch (cause) {
      feedback(cause instanceof Error ? cause.message : 'Unable to update the pack.', 'error')
    }
  }
  return (
    <div className="space-y-0">
      <section className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <TitleWithInfo
          className="section-title text-lg"
          title="Supplier Price List"
          info={
            canEdit
              ? 'Enter each supplier’s agreed cost per box from their quotation. A supplier can offer several box sizes of one product; each is its own pack with its own price. A new price takes effect on its date and keeps the old one in history.'
              : 'Costs per box agreed with each supplier. Purchase orders use these prices; only the administrator can change them. If an invoice shows a different price, record it when receiving.'
          }
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show removed packs
          </label>
          {canEdit && (
            <button type="button" className="primary-button" onClick={() => setAdding({})}>
              <FiPlus aria-hidden="true" /> Add Pack &amp; Price
            </button>
          )}
        </div>
      </section>
      {canEdit && differences.length > 0 && (
        <section className="border-b border-amber-200 bg-amber-50/60 p-4 sm:p-5">
          <TitleWithInfo
            className="section-title text-base text-amber-900"
            title={`Differences Found at Receiving (${differences.length})`}
            info="Deliveries whose invoice cost or box size differed from the price list. Check with the supplier, then update the price or add the new box size."
          />
          <div className="mt-3 overflow-x-auto rounded-md border border-amber-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-amber-50 text-left text-xs text-amber-900">
                <tr>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Supplier / Order</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Ordered</th>
                  <th className="px-3 py-2 text-right">Invoice</th>
                  <th className="px-3 py-2">Reason Given</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {differences.slice(0, 20).map((row) => {
                  const pack = packs.find(
                    (value) =>
                      value.supplierId === row.supplierId &&
                      value.drugId === row.drugId &&
                      value.piecesPerBox === row.deliveredPiecesPerBox
                  )
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{showDate(row.deliveredAt)}</td>
                      <td className="px-3 py-2">
                        {row.supplierName}
                        <p className="text-xs break-all text-slate-500">{row.orderNumber}</p>
                      </td>
                      <td className="px-3 py-2">{row.productName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {currency.format(row.orderedUnitCost)} / box of {row.orderedPiecesPerBox}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {currency.format(row.invoiceUnitCost)} / box of {row.deliveredPiecesPerBox}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {row.reason ?? '—'}
                        <p className="text-xs">by {row.recordedByName}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {pack ? (
                          <button
                            type="button"
                            className="secondary-button h-9 text-xs"
                            onClick={() => setPricing({ pack, cost: row.invoiceUnitCost })}
                          >
                            Update Price
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="secondary-button h-9 text-xs"
                            onClick={() =>
                              setAdding({
                                supplierId: String(row.supplierId),
                                drugId: String(row.drugId),
                                piecesPerBox: String(row.deliveredPiecesPerBox),
                                unitCost: String(row.invoiceUnitCost)
                              })
                            }
                          >
                            Add Box Size
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="surface-header text-left text-slate-500">
            <tr>
              <th className="py-3 pr-5 pl-9">Product</th>
              <th className="px-5 py-3">Pack</th>
              <th className="px-5 py-3 text-right whitespace-nowrap">Cost per Box</th>
              <th className="px-5 py-3">Effective / Quotation</th>
              <th className="px-5 py-3">Next Price</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          {bySupplier.map(([supplier, rows]) => (
            <tbody key={supplier} className="divide-y divide-slate-100/90">
              {/* Note: QA Tests 3: the supplier row read like another product. It is now a
                  labelled band with an icon and a pack count, and the products below are
                  indented under it. */}
              <tr className="border-brand-600 border-l-4 bg-slate-100">
                <th colSpan={6} scope="colgroup" className="px-4 py-2.5 text-left">
                  <span className="flex items-center gap-3">
                    <span className="bg-brand-600 grid size-8 shrink-0 place-items-center rounded-md text-white">
                      <FiTruck aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-brand-700 block text-xs font-bold tracking-wider uppercase">
                        Supplier
                      </span>
                      <span className="block text-base font-bold text-slate-900">{supplier}</span>
                    </span>
                    <span className="ml-auto text-xs font-medium whitespace-nowrap text-slate-600">
                      {rows.length} pack{rows.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </th>
              </tr>
              {rows.map((pack) => (
                <PackRow
                  key={pack.id}
                  pack={pack}
                  canEdit={canEdit}
                  open={history === pack.id}
                  toggleHistory={() => setHistory(history === pack.id ? null : pack.id)}
                  newPrice={() => setPricing({ pack })}
                  toggleArchive={() => void toggleArchive(pack)}
                />
              ))}
            </tbody>
          ))}
        </table>
        {!loading && shown.length === 0 && (
          <EmptyState
            title="No prices on the list yet."
            description={
              canEdit
                ? 'Add each supplier’s agreed cost per box with Add Pack & Price. Purchase orders can only be created for packs on this list.'
                : 'Ask the administrator to enter the supplier prices. Purchase orders use this list.'
            }
          />
        )}
        {loading && packs.length === 0 && <EmptyState title="Loading the price list…" />}
      </div>
      {adding && (
        <PackDialog
          initial={adding}
          suppliers={suppliers}
          products={products}
          close={() => setAdding(null)}
          saved={async (message) => {
            setAdding(null)
            feedback(message)
            await load()
          }}
        />
      )}
      {pricing && (
        <PriceDialog
          pack={pricing.pack}
          initialCost={pricing.cost}
          close={() => setPricing(null)}
          saved={async (message) => {
            setPricing(null)
            feedback(message)
            await load()
          }}
        />
      )}
    </div>
  )
}

function PackRow({
  pack,
  canEdit,
  open,
  toggleHistory,
  newPrice,
  toggleArchive
}: {
  pack: SupplierPackRecord
  canEdit: boolean
  open: boolean
  toggleHistory: VoidFunction
  newPrice: VoidFunction
  toggleArchive: VoidFunction
}): ReactElement {
  return (
    <>
      <tr className={pack.isArchived ? 'text-slate-500' : 'hover:bg-brand-50/50'}>
        <td className="py-3 pr-5 pl-9">
          <p className="font-medium text-slate-900">{pack.productName}</p>
          {pack.isArchived && (
            <span className="mt-1 inline-block rounded border border-slate-300 px-1.5 py-0.5 text-xs font-semibold">
              Removed from new orders
            </span>
          )}
        </td>
        <td className="px-5 py-3 whitespace-nowrap">
          Box of {pack.piecesPerBox} pc{pack.piecesPerBox === 1 ? '' : 's'}
        </td>
        <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums">
          {pack.current ? (
            <>
              <span className="font-semibold">{currency.format(pack.current.unitCost)}</span>
              <p className="text-xs text-slate-500">
                {currency.format(pack.current.unitCost / pack.piecesPerBox)} per piece
              </p>
            </>
          ) : (
            <span className="text-amber-800">Starts later</span>
          )}
        </td>
        <td className="px-5 py-3 text-slate-600">
          {pack.current ? (
            <>
              From {showDate(pack.current.effectiveFrom)}
              <p className="text-xs">{pack.current.quotationReference ?? 'No quotation number'}</p>
            </>
          ) : (
            '—'
          )}
        </td>
        <td className="px-5 py-3 text-slate-600">
          {pack.upcoming
            ? `${currency.format(pack.upcoming.unitCost)} from ${showDate(pack.upcoming.effectiveFrom)}`
            : '—'}
        </td>
        <td className="px-5 py-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="icon-button"
              aria-expanded={open}
              aria-label={`Price history of ${pack.productName}, box of ${pack.piecesPerBox}`}
              title="Price History"
              onClick={toggleHistory}
            >
              <FiClock />
            </button>
            {canEdit && !pack.isArchived && (
              <button
                type="button"
                className="secondary-button h-9 text-xs whitespace-nowrap"
                onClick={newPrice}
              >
                <FiTag aria-hidden="true" /> New Price
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                className="icon-button"
                aria-label={`${pack.isArchived ? 'Restore' : 'Remove'} ${pack.productName}, box of ${pack.piecesPerBox}`}
                title={pack.isArchived ? 'Put Back on the List' : 'Remove from New Orders'}
                onClick={toggleArchive}
              >
                {pack.isArchived ? <FiRotateCcw /> : <FiArchive />}
              </button>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-5 py-3">
            <p className="text-xs font-semibold text-slate-600 uppercase">Price History</p>
            <ul className="mt-2 space-y-1 text-sm">
              {pack.history.map((price) => (
                <li key={price.id} className="flex flex-wrap gap-x-3">
                  <span className="font-medium tabular-nums">
                    {currency.format(price.unitCost)}
                  </span>
                  <span>from {showDate(price.effectiveFrom)}</span>
                  <span className="text-slate-500">
                    {price.quotationReference ?? 'No quotation number'} · recorded by{' '}
                    {price.recordedByName ?? 'system (carried over)'}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

interface NewPackDraft {
  supplierId: string
  drugId: string
  supplierName: string
  productName: string
  piecesPerBox: string
  unitCost: string
  effectiveFrom: string
  quotationReference: string
}

function PackDialog({
  initial,
  suppliers,
  products,
  close,
  saved
}: {
  initial: Partial<NewPackDraft>
  suppliers: Supplier[]
  products: ItemProfile[]
  close: VoidFunction
  saved: (message: string) => Promise<void>
}): ReactElement {
  const [values, setValues] = useState<NewPackDraft>(() => ({
    supplierId: initial.supplierId ?? '',
    drugId: initial.drugId ?? '',
    supplierName: '',
    productName: '',
    piecesPerBox: initial.piecesPerBox ?? '',
    unitCost: initial.unitCost ?? '',
    effectiveFrom: localDate(),
    quotationReference: ''
  }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof NewPackDraft, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await createPack({
        supplierId: Number(values.supplierId),
        drugId: Number(values.drugId),
        piecesPerBox: values.piecesPerBox.trim() === '' ? Number.NaN : Number(values.piecesPerBox),
        unitCost: values.unitCost.trim() === '' ? Number.NaN : Number(values.unitCost),
        effectiveFrom: values.effectiveFrom,
        quotationReference: values.quotationReference
      })
      const product = products.find((item) => String(item.id) === values.drugId)
      await saved(
        `${product?.brandName ?? 'Product'}, box of ${values.piecesPerBox}, added to the price list.`
      )
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to save the pack.')
      setErrors(result.fields)
      setError(result.form)
      setSaving(false)
    }
  }
  return (
    <Modal
      title="Add Pack & Price"
      info="One product as one supplier sells it: the box size and the agreed cost per box."
      close={close}
      busy={saving}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        <RequiredNote />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Supplier" required error={errors.supplierId}>
            <select
              className="field"
              value={values.supplierId}
              onChange={(event) => set('supplierId', event.target.value)}
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.organization}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Product" required error={errors.drugId}>
            <select
              className="field"
              value={values.drugId}
              onChange={(event) => set('drugId', event.target.value)}
            >
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.brandName} · {product.formulation}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Pieces per Box"
            required
            info="Use 1 if the supplier sells it by the piece or bottle."
            error={errors.piecesPerBox}
          >
            <input
              className="field"
              type="number"
              min="1"
              max="10000"
              step="1"
              inputMode="numeric"
              placeholder="e.g. 100"
              value={values.piecesPerBox}
              onChange={(event) => set('piecesPerBox', event.target.value)}
            />
          </FormField>
          <FormField label="Agreed Cost per Box (₱)" required error={errors.unitCost}>
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={values.unitCost}
              onChange={(event) => set('unitCost', event.target.value)}
            />
          </FormField>
          <FormField
            label="Effective From"
            required
            info="Orders submitted on or after this date use this price."
            error={errors.effectiveFrom}
          >
            <input
              className="field"
              type="date"
              value={values.effectiveFrom}
              onChange={(event) => set('effectiveFrom', event.target.value)}
            />
          </FormField>
          <FormField
            label="Quotation No."
            info="The supplier's quotation or price list reference."
            error={errors.quotationReference}
          >
            <input
              className="field"
              maxLength={80}
              placeholder="e.g. Q-2026-115"
              value={values.quotationReference}
              onChange={(event) =>
                set('quotationReference', filterInput('reference', event.target.value).value)
              }
            />
          </FormField>
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="secondary-button" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Saving…' : 'Add to Price List'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PriceDialog({
  pack,
  initialCost,
  close,
  saved
}: {
  pack: SupplierPackRecord
  initialCost?: number
  close: VoidFunction
  saved: (message: string) => Promise<void>
}): ReactElement {
  const [unitCost, setUnitCost] = useState(initialCost !== undefined ? String(initialCost) : '')
  const [effectiveFrom, setEffectiveFrom] = useState(localDate())
  const [quotationReference, setQuotationReference] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setErrors({})
    try {
      await updatePackPrice({
        packId: pack.id,
        unitCost: unitCost.trim() === '' ? Number.NaN : Number(unitCost),
        effectiveFrom,
        quotationReference
      })
      await saved(
        `New price for ${pack.productName}, box of ${pack.piecesPerBox}: ${currency.format(Number(unitCost))} from ${showDate(effectiveFrom)}.`
      )
    } catch (cause) {
      const result = splitErrors(cause, 'Unable to save the price.')
      setErrors(result.fields)
      setError(result.form)
      setSaving(false)
    }
  }
  return (
    <Modal
      title={`New Price: ${pack.productName}`}
      description={`${pack.supplierName}, box of ${pack.piecesPerBox}. Current price ${pack.current ? currency.format(pack.current.unitCost) : 'not yet in effect'}.`}
      info="The new price takes effect on its date. The old price stays in history."
      close={close}
      size="sm"
      busy={saving}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        <FormField label="Agreed Cost per Box (₱)" required error={errors.unitCost}>
          <input
            className="field"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
          />
        </FormField>
        <FormField label="Effective From" required error={errors.effectiveFrom}>
          <input
            className="field"
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </FormField>
        <FormField label="Quotation No." error={errors.quotationReference}>
          <input
            className="field"
            maxLength={80}
            value={quotationReference}
            onChange={(event) =>
              setQuotationReference(filterInput('reference', event.target.value).value)
            }
          />
        </FormField>
        <FormError message={error} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="secondary-button" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Saving…' : 'Save Price'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
