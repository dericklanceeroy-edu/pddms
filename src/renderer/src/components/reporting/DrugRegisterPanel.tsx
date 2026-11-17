import FormField, { FormError } from '@renderer/components/ui/FormField'
import InfoTip from '@renderer/components/ui/InfoTip'
import type { ItemProfile } from '@renderer/data/profiles'
import { exportRegister, getRegister } from '@renderer/services/controls'
import { getProducts } from '@renderer/services/profiles'
import type { DrugRegister, RegisterEntry } from '@shared/controls'
import { localDate } from '@shared/inventory'
import { useEffect, useState, type ReactElement } from 'react'
import { FiBookOpen, FiFileText } from 'react-icons/fi'

const kindLabel: Record<RegisterEntry['kind'], string> = {
  received: 'Received',
  dispensed: 'Dispensed',
  void: 'Void (returned to stock)',
  wholesale: 'Wholesale delivery',
  write_off: 'Written off',
  supplier_return: 'Returned to supplier',
  count: 'Stock count'
}

const monthStart = (): string => `${localDate().slice(0, 8)}01`

/**
 * Dangerous drugs register: a per-drug logbook of every movement with a running balance, laid out
 * like the paper register (received with supplier and invoice; dispensed with patient, address,
 * prescription number and the doctor's S2 license). It is printed or saved as PDF/CSV by period.
 */
export default function DrugRegisterPanel(): ReactElement {
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [drugId, setDrugId] = useState('')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(localDate)
  const [register, setRegister] = useState<DrugRegister | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void getProducts()
      .then((items) => {
        const controlled = items.filter((item) => item.controlled)
        setProducts(controlled)
        if (controlled.length) setDrugId(String(controlled[0].id))
      })
      .catch(() => setProducts([]))
  }, [])
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    if (!drugId) {
      setError('Choose a controlled product.')
      return
    }
    if (from > to) {
      setError('The “From” date must be on or before the “Through” date.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the register.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel space-y-4 p-5 sm:p-6" aria-labelledby="dd-register-title">
      <div className="flex items-start gap-3">
        <span className="bg-brand-50 text-brand-700 grid size-10 shrink-0 place-items-center rounded-lg">
          <FiBookOpen aria-hidden="true" />
        </span>
        <div>
          <div className="flex items-center gap-1.5">
            <h3 id="dd-register-title" className="section-title">
              Dangerous Drugs Register
            </h3>
            <InfoTip label="Dangerous Drugs Register">
              Every receipt, sale, void, write-off, return and count of one controlled product, with
              a running balance. Save it as PDF to print and sign like the paper logbook.
            </InfoTip>
          </div>
        </div>
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-slate-500">
          No product is marked as controlled. Mark dangerous drugs as controlled on the product page
          to keep their register.
        </p>
      ) : (
        <form
          className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => setRegister(await getRegister(Number(drugId), from, to)))
          }}
        >
          <FormField label="Controlled Product" required>
            <select
              className="field"
              value={drugId}
              onChange={(event) => setDrugId(event.target.value)}
            >
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.brandName} · {item.genericName} · {item.formulation}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="From" required>
            <input
              className="field"
              type="date"
              max={to}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </FormField>
          <FormField label="Through" required>
            <input
              className="field"
              type="date"
              min={from}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </FormField>
          <div className="flex gap-2">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Loading…' : 'Show Register'}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (await exportRegister(Number(drugId), from, to)) setNotice('Register saved.')
                })
              }
            >
              <FiFileText aria-hidden="true" /> Save PDF / CSV
            </button>
          </div>
        </form>
      )}
      <FormError message={error} />
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {register && (
        <div className="space-y-3">
          <dl className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-4">
            <Figure label="Opening balance" value={register.openingBalance} />
            <Figure
              label="Received"
              value={register.entries.reduce((sum, entry) => sum + entry.quantityIn, 0)}
            />
            <Figure
              label="Out"
              value={register.entries.reduce((sum, entry) => sum + entry.quantityOut, 0)}
            />
            <Figure label="Closing balance" value={register.closingBalance} />
          </dl>
          {register.unexplained !== 0 && (
            <p
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {Math.abs(register.unexplained)} piece(s) on hand are not explained by a recorded
              movement (stock entered before this register was kept). Do a stock count of this
              product to record them with a reason.
            </p>
          )}
          <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3 py-2 text-right">Out</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2">Supplier / Patient</th>
                  <th className="px-3 py-2">Rx No.</th>
                  <th className="px-3 py-2">S2 No.</th>
                  <th className="px-3 py-2">Doctor</th>
                  <th className="px-3 py-2">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {register.entries.map((entry, index) => (
                  <tr key={index} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(entry.at).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {kindLabel[entry.kind]}
                      {entry.remarks && (
                        <span className="block text-xs text-slate-500">{entry.remarks}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{entry.batchNumber}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entry.quantityIn || ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entry.quantityOut || ''}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {entry.balance}
                    </td>
                    <td className="px-3 py-2">{entry.supplier ?? entry.patient ?? '—'}</td>
                    <td className="px-3 py-2">{entry.prescriptionNumber ?? '—'}</td>
                    <td className="px-3 py-2">{entry.s2License ?? '—'}</td>
                    <td className="px-3 py-2">{entry.practitioner ?? '—'}</td>
                    <td className="max-w-48 px-3 py-2 break-all">{entry.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {register.entries.length === 0 && (
              <p className="p-5 text-sm text-slate-500">No movements in this period.</p>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Check the columns against the current PDEA register requirements before relying on this
            printout for an inspection.
          </p>
        </div>
      )}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString()} pcs</dd>
    </div>
  )
}
