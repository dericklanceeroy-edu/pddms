import FormField, { FormError } from '@renderer/components/ui/FormField'
import Modal from '@renderer/components/ui/Modal'
import { getCashCountPreview, recordCashCount } from '@renderer/services/controls'
import {
  countedCents,
  denominationCents,
  denominations,
  overShortLabel,
  type CashCountPreview,
  type CashCountRecord,
  type Denomination
} from '@shared/controls'
import { money } from '@shared/sales'
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'

const label = (value: Denomination): string =>
  Number(value) >= 20 ? `₱${value} bills` : Number(value) >= 1 ? `₱${value} coins` : '25¢ coins'

/**
 * End-of-day drawer count for the signed-in cashier. Expected cash = opening float + today's
 * completed cash sales (voided sales and e-wallet payments are not in the drawer). The count is
 * saved with the difference, shown as Over, Short or Balanced.
 */
export default function CashCountDialog({ close }: { close: VoidFunction }): ReactElement {
  const [preview, setPreview] = useState<CashCountPreview | null>(null)
  const [float, setFloat] = useState('')
  const [pieces, setPieces] = useState<Partial<Record<Denomination, string>>>({})
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<CashCountRecord | null>(null)
  useEffect(() => {
    void getCashCountPreview()
      .then(setPreview)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Unable to load today’s cash sales.')
      )
  }, [])
  const counts = Object.fromEntries(
    denominations.map((value) => [value, Number(pieces[value] || 0)])
  ) as Record<Denomination, number>
  const floatCents = Math.round((Number(float) || 0) * 100)
  const counted = countedCents(counts)
  const expected = floatCents + (preview?.cashSalesCents ?? 0)
  const difference = counted - expected
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving || !preview) return
    if (!/^\d+(\.\d{1,2})?$/.test(float.trim())) {
      setError('Enter the opening float in pesos, e.g. 1000 or 1000.50. Enter 0 if none.')
      return
    }
    if (denominations.some((value) => !Number.isInteger(counts[value]) || counts[value] < 0)) {
      setError('Enter whole numbers of bills and coins.')
      return
    }
    if (difference !== 0 && notes.trim().length < 3) {
      setError('The drawer is over or short. Add a note explaining the difference.')
      return
    }
    if (preview.previousCountId !== null && notes.trim().length < 3) {
      setError('You already counted today. Say why you are counting again in Notes.')
      return
    }
    setSaving(true)
    setError('')
    try {
      setSaved(
        await recordCashCount({
          openingFloatCents: floatCents,
          denominations: Object.fromEntries(
            denominations
              .filter((value) => counts[value] > 0)
              .map((value) => [value, counts[value]])
          ),
          notes: notes.trim()
        })
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the cash count.')
    } finally {
      setSaving(false)
    }
  }
  const tone =
    difference === 0
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : 'border-amber-300 bg-amber-50 text-amber-900'
  if (saved)
    return (
      <Modal title="Cash Count Saved" close={close} size="sm">
        <dl className="space-y-2 rounded-md bg-slate-50 p-4 text-sm">
          <Line label="Business date" value={saved.businessDate} />
          <Line label="Expected in drawer" value={money(saved.expectedCents)} />
          <Line label="Counted" value={money(saved.countedCents)} />
          <Line
            label={overShortLabel(saved.differenceCents)}
            value={money(Math.abs(saved.differenceCents))}
            strong
          />
        </dl>
        <p className="mt-3 text-sm text-slate-600">
          Saved under your name. The administrator sees every count in Reports, End-of-Day Cash
          Counts.
        </p>
        <div className="mt-4 flex justify-end">
          <button type="button" className="primary-button" onClick={close}>
            Done
          </button>
        </div>
      </Modal>
    )
  return (
    <Modal
      title="End-of-Day Cash Count"
      description="Count the cash drawer at closing. Enter how many of each bill and coin you have."
      close={close}
      size="md"
      busy={saving}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        {preview && (
          <dl className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <Stat
              label="Cash sales today"
              value={`${money(preview.cashSalesCents)} (${preview.cashSalesCount})`}
            />
            <Stat label="GCash / Maya (not in drawer)" value={money(preview.ewalletSalesCents)} />
            <Stat label="Voided today (left out)" value={String(preview.voidedCount)} />
          </dl>
        )}
        {preview?.previousCountId != null && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Recount.</strong> You already saved count #{preview.previousCountId} today. This
            count replaces it in the report; the earlier one stays on record. Say why you are
            counting again in Notes.
          </p>
        )}
        <FormField
          label="Opening Float (₱)"
          required
          hint="Change money placed in the drawer at the start of the day. Enter 0 if none."
        >
          <input
            className="field sm:max-w-48"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={float}
            onChange={(event) => setFloat(event.target.value)}
          />
        </FormField>
        <fieldset>
          <legend className="field-label">Bills and Coins Counted</legend>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {denominations.map((value) => (
              <label key={value} className="text-xs font-semibold text-slate-700">
                {label(value)}
                <input
                  className="field mt-1"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={pieces[value] ?? ''}
                  placeholder="0"
                  onChange={(event) =>
                    setPieces((current) => ({ ...current, [value]: event.target.value }))
                  }
                />
                <span className="mt-0.5 block font-normal text-slate-500 tabular-nums">
                  {money(denominationCents(value) * (counts[value] || 0))}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={`rounded-md border p-4 text-sm ${tone}`} role="status">
          <dl className="space-y-1">
            <Line label="Expected (float + cash sales)" value={money(expected)} />
            <Line label="Counted" value={money(counted)} />
            <Line
              label={`${overShortLabel(difference)}${difference === 0 ? '' : ' by'}`}
              value={money(Math.abs(difference))}
              strong
            />
          </dl>
        </div>
        <FormField
          label="Notes"
          required={difference !== 0 || preview?.previousCountId != null}
          hint={
            difference !== 0
              ? 'Explain the difference, e.g. gave wrong change.'
              : preview?.previousCountId != null
                ? 'Say why you are counting again.'
                : 'Optional.'
          }
        >
          <input
            className="field"
            maxLength={300}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
        <FormError message={error} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="secondary-button" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving || !preview}>
            {saving ? 'Saving…' : 'Save Cash Count'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900 tabular-nums">{value}</dd>
    </div>
  )
}

function Line({
  label,
  value,
  strong = false
}: {
  label: string
  value: string
  strong?: boolean
}): ReactElement {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'text-base font-bold' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
