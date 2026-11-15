import Modal from '@renderer/components/ui/Modal'
import { exportReceipt } from '@renderer/services/sales'
import { business, businessContact, businessTin, code128, receiptModel } from '@shared/receipt'
import type { SaleRecord } from '@shared/sales'
import { useMemo, useState, type ReactElement } from 'react'
import { FiDownload } from 'react-icons/fi'

/** Code 128 barcode drawn with SVG rectangles. */
function Barcode({ value }: { value: string }): ReactElement {
  const { bars, width } = useMemo(() => code128(value), [value])
  return (
    <svg
      viewBox={`0 0 ${width} 48`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
      className="h-12 w-full"
    >
      <rect width={width} height={48} fill="#fff" />
      {bars.map(([x, barWidth]) => (
        <rect key={x} x={x} width={barWidth} height={48} fill="#000" />
      ))}
    </svg>
  )
}

/**
 * Completed-sale receipt laid out like a standard 80 mm thermal pharmacy receipt: centred store
 * header, date and time, items with right-aligned amounts, totals, cash and change, and a barcode.
 */
export default function Receipt({
  sale,
  close
}: {
  sale: SaleRecord
  close: VoidFunction
}): ReactElement {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <Modal
      title="Sale Completed"
      description="Check the receipt with the customer, then save it as a PDF or text file."
      close={close}
      size="sm"
      busy={saving}
    >
      <div className="rounded-lg bg-slate-100 p-3 sm:p-4">
        <ReceiptSlip sale={sale} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {message && (
          <p role="status" className="mr-auto text-sm font-medium text-slate-700">
            {message}
          </p>
        )}
        <button type="button" className="secondary-button" onClick={close} disabled={saving}>
          Close
        </button>
        <button
          type="button"
          className="primary-button"
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
          <FiDownload aria-hidden="true" /> {saving ? 'Saving…' : 'Save Receipt'}
        </button>
      </div>
    </Modal>
  )
}

/** The printed slip itself, shared by the completion dialog and tests. */
export function ReceiptSlip({ sale }: { sale: SaleRecord }): ReactElement {
  const model = receiptModel(sale)
  return (
    <article
      aria-label={`Receipt ${model.number}`}
      className="mx-auto w-full max-w-[320px] bg-white px-4 py-5 font-mono text-[12px] leading-[1.45] text-black shadow-md"
    >
      <header className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-2 grid size-10 place-items-center rounded-full border-2 border-black font-sans text-2xl leading-none font-bold"
        >
          +
        </div>
        <p className="text-[13px] font-bold tracking-wide uppercase">{business.name}</p>
        <p>{business.address}</p>
        <p>{businessContact}</p>
        <p>{businessTin}</p>
        <p className="mt-1 font-bold">SALES RECEIPT</p>
      </header>
      <Rule />
      <Row left={`DATE: ${model.date}`} right={`TIME: ${model.time}`} />
      <p>RECEIPT NO: {model.number}</p>
      <p className="text-[10px] break-all">REF: {model.reference}</p>
      <p>CASHIER: {model.cashier}</p>
      <p className="break-words">CUSTOMER: {model.customer}</p>
      {model.discountLine && <p className="break-words">{model.discountLine}</p>}
      <Rule />
      <ul className="space-y-1.5">
        {model.lines.map((line, index) => (
          <li key={index}>
            <p className="font-bold break-words">{line.name}</p>
            <Row left={line.quantity} right={line.amount} />
            <p className="text-[10px]">{line.meta}</p>
          </li>
        ))}
      </ul>
      <Rule />
      {model.totals.map((row) =>
        row.strong ? (
          <div key={row.label}>
            <div className="my-1.5 border-t border-black" />
            <Row left={row.label} right={row.amount} className="text-[15px] font-bold" />
          </div>
        ) : (
          <Row key={row.label} left={row.label.toUpperCase()} right={row.amount} />
        )
      )}
      {model.payment.map((row) => (
        <Row key={row.label} left={row.label.toUpperCase()} right={row.amount} />
      ))}
      <Rule />
      <div className="text-center">
        <Barcode value={model.number} />
        <p className="mt-0.5 tracking-widest">{model.number}</p>
        <p className="mt-2">Thank you for your purchase!</p>
      </div>
    </article>
  )
}

function Rule(): ReactElement {
  return <div className="my-2 border-t border-dashed border-black" aria-hidden="true" />
}

function Row({
  left,
  right,
  className = ''
}: {
  left: string
  right: string
  className?: string
}): ReactElement {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <span className="min-w-0 break-words">{left}</span>
      <span className="shrink-0 text-right tabular-nums">{right}</span>
    </div>
  )
}
