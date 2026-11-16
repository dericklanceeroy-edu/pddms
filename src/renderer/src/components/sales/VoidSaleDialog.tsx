import FormField, { FormError, RequiredNote } from '@renderer/components/ui/FormField'
import Modal from '@renderer/components/ui/Modal'
import { voidSale } from '@renderer/services/controls'
import { money, type SaleRecord } from '@shared/sales'
import { useState, type FormEvent, type ReactElement } from 'react'

/**
 * Voids a whole retail sale of today that was rung up wrong. The sale stays in history marked
 * VOID. Medicines that came back go back to their batch; medicines the customer kept are written
 * off as lost. A cashier needs an administrator to type their username and password.
 */
export default function VoidSaleDialog({
  sale,
  needsApproval,
  close,
  voided
}: {
  sale: Omit<SaleRecord, 'items'>
  needsApproval: boolean
  close: VoidFunction
  voided: (sale: SaleRecord) => Promise<void>
}): ReactElement {
  const [reason, setReason] = useState('')
  const [returned, setReturned] = useState<'yes' | 'no' | ''>('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (saving) return
    if (reason.trim().length < 5) {
      setError('Say why the sale is voided (at least 5 characters).')
      return
    }
    if (!returned) {
      setError('Say whether the medicines came back to the counter.')
      return
    }
    if (needsApproval && (!username.trim() || !password)) {
      setError('Ask an administrator to enter their username and password to approve the void.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await voidSale({
        saleId: sale.id,
        reason: reason.trim(),
        itemsReturned: returned === 'yes',
        approval: needsApproval ? { username: username.trim(), password } : null
      })
      setPassword('')
      await voided(saved)
    } catch (cause) {
      setPassword('')
      setError(cause instanceof Error ? cause.message : 'Unable to void the sale.')
      setSaving(false)
    }
  }
  return (
    <Modal
      title={`Void ${sale.reference}?`}
      description={`${sale.customerName} · ${money(sale.totalCents)} · ${new Date(sale.createdAt).toLocaleString()}`}
      close={close}
      size="sm"
      busy={saving}
    >
      <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Use a void only for a sale of today that was rung up wrong. The sale stays in history
          marked <strong>VOID</strong> and is left out of sales totals. Refund the customer at the
          counter as usual.
        </p>
        <RequiredNote />
        <FormField label="Reason" required>
          <textarea
            className="field min-h-20"
            maxLength={300}
            value={reason}
            placeholder="e.g. Wrong product scanned; customer did not take the items"
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
        <fieldset className="space-y-2">
          <legend className="field-label">
            Did the medicines come back to the counter?
            <span className="required-mark" aria-hidden="true">
              {' '}
              *
            </span>
          </legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="items-returned"
              className="mt-0.5 size-4"
              checked={returned === 'yes'}
              onChange={() => setReturned('yes')}
            />
            <span>
              <strong>Yes, I have them.</strong> They go back to the batch they came from.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="items-returned"
              className="mt-0.5 size-4"
              checked={returned === 'no'}
              onChange={() => setReturned('no')}
            />
            <span>
              <strong>No, the customer kept them.</strong> Stock is not put back; it is written off
              as lost with this sale&apos;s reference.
            </span>
          </label>
        </fieldset>
        {needsApproval && (
          <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">Administrator Approval</legend>
            <p className="text-xs text-slate-500">
              The administrator types their own sign-in here. After five wrong tries, approvals from
              this account pause for a minute.
            </p>
            <FormField label="Administrator Username" required>
              <input
                className="field"
                autoComplete="off"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </FormField>
            <FormField label="Administrator Password" required>
              <input
                className="field"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
          </fieldset>
        )}
        <FormError message={error} />
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="secondary-button" onClick={close} disabled={saving}>
            Keep Sale
          </button>
          <button type="submit" className="danger-button" disabled={saving}>
            {saving ? 'Voiding…' : 'Void Sale'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
