import { Barcode, Row, Rule } from '@renderer/components/sales/Receipt'
import { business, businessContact, businessTin } from '@shared/receipt'
import { deliveryReceiptModel, type WholesaleDetails } from '@shared/wholesale'
import type { ReactElement } from 'react'

/**
 * Delivery receipt laid out like the 80 mm sales receipt: store header, order and client details,
 * items with right-aligned amounts, the order total, who handled the order and two signature lines.
 */
export default function DeliveryReceiptSlip({ order }: { order: WholesaleDetails }): ReactElement {
  const model = deliveryReceiptModel(order)
  return (
    <article
      aria-label={`Delivery receipt ${model.number}`}
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
        <p className="mt-1 font-bold">DELIVERY RECEIPT</p>
      </header>
      <Rule />
      <Row left={`DR NO: ${model.number}`} right={`ORDER: ${model.orderDate}`} />
      <p className="text-[11px] break-all">REF: {model.reference}</p>
      <Row left={`DELIVERED: ${model.deliveredDate}`} right={model.deliveredTime} />
      <Rule />
      <p className="break-words">CLIENT: {model.client}</p>
      <p>CONTACT: {model.contact}</p>
      <p className="break-words">DELIVER TO: {model.address}</p>
      <Rule />
      <ul className="space-y-1.5">
        {model.lines.map((line, index) => (
          <li key={index}>
            <p className="font-bold break-words">{line.name}</p>
            <Row left={line.quantity} right={line.amount} />
            <p className="text-[11px]">{line.meta}</p>
          </li>
        ))}
      </ul>
      <div className="my-1.5 border-t border-black" />
      <Row left="ORDER TOTAL" right={model.total} className="text-[15px] font-bold" />
      <Row left="PAYMENT DUE" right={model.dueDate} />
      <Rule />
      <p className="break-words">Delivery notes: {model.notes}</p>
      {model.handlers.map((row) => (
        <p key={row.label} className="break-words">
          {row.label}: {row.value}
        </p>
      ))}
      {model.signatures.map((row) => (
        <div key={row.label} className="mt-4">
          <p className="break-words">
            {row.label}: {row.name}
          </p>
          <p className="mt-6 border-t border-black pt-0.5">Signature</p>
        </div>
      ))}
      <Rule />
      <div className="text-center">
        <Barcode value={model.number} />
        <p className="mt-0.5 tracking-widest">{model.number}</p>
        <p className="mt-2">Proof of delivery. Not an official receipt.</p>
      </div>
    </article>
  )
}
