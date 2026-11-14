import { money, type SaleLine, type SaleRecord } from './sales'
import { quantityLabel, unitWord } from './units'

/** Business details printed at the top of every receipt. */
export const business = {
  name: 'Med Prix Distributor and Pharmacy',
  address: 'G Mesa St, General Santos City (Dadiangas), South Cotabato'
}

/** Short, scannable receipt number, e.g. MP00000012. The full sale reference is printed too. */
export const receiptNumber = (sale: Pick<SaleRecord, 'id'>): string =>
  `MP${String(sale.id).padStart(8, '0')}`

// Note: Standard Code 128 bar/space widths for values 0-106 (106 is the stop pattern).
const CODE128 =
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(
    ' '
  )

/**
 * Code 128 (set B) bars for printable ASCII text: each entry is a bar's x position and width in
 * modules. `width` is the total width including the 10-module quiet zones.
 */
export function code128(text: string): { bars: Array<[number, number]>; width: number } {
  const values = [...text].map((character) => {
    const code = character.charCodeAt(0)
    if (code < 32 || code > 126) throw new Error('Barcode text must be printable ASCII.')
    return code - 32
  })
  const checksum = values.reduce((sum, value, index) => sum + value * (index + 1), 104) % 103
  const bars: Array<[number, number]> = []
  let x = 10
  for (const value of [104, ...values, checksum, 106]) {
    const pattern = CODE128[value]
    for (let index = 0; index < pattern.length; index++) {
      const width = Number(pattern[index])
      if (index % 2 === 0) bars.push([x, width])
      x += width
    }
  }
  return { bars, width: x + 10 }
}

/** Inline SVG markup of a Code 128 barcode, scaled to the given pixel width. */
export function barcodeSvg(text: string, height = 48): string {
  const { bars, width } = code128(text)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${escapeHtml(text)}" style="width:100%;height:${height}px"><rect width="${width}" height="${height}" fill="#fff"/>${bars.map(([x, w]) => `<rect x="${x}" width="${w}" height="${height}" fill="#000"/>`).join('')}</svg>`
}

export interface ReceiptLine {
  name: string
  /** "5 pieces × ₱12.00/piece" */
  quantity: string
  /** "Lot LOT-1 · Exp 2027-11-12" */
  meta: string
  amount: string
}
export interface ReceiptModel {
  number: string
  reference: string
  date: string
  time: string
  cashier: string
  customer: string
  discountLine: string | null
  lines: ReceiptLine[]
  totals: Array<{ label: string; amount: string; strong?: boolean }>
  payment: Array<{ label: string; amount: string }>
}

const discountName = (sale: SaleRecord): string =>
  sale.discountType === 'senior' ? 'Senior Citizen' : 'PWD'

export function receiptLine(item: SaleLine): ReceiptLine {
  return {
    name: item.productName,
    quantity: `${quantityLabel(item.quantity, item.unit, item.piecesPerUnit)} × ${money(item.unitPriceCents)}/${unitWord(item.unit, item.piecesPerUnit)}`,
    meta: `Lot ${item.batchNumber} · Exp ${item.expiresAt}`,
    amount: money(item.quantity * item.unitPriceCents)
  }
}

/** Everything a receipt shows, in print order. Used by the screen, the PDF and the text file. */
export function receiptModel(sale: SaleRecord): ReceiptModel {
  const created = new Date(sale.createdAt)
  const discounted = sale.discountType !== 'none'
  return {
    number: receiptNumber(sale),
    reference: sale.reference,
    date: created.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }),
    time: created.toLocaleTimeString('en-PH'),
    cashier: sale.cashierName,
    customer: sale.customerName,
    discountLine: discounted
      ? `${discountName(sale)} ID: ${sale.discountId ?? '—'}${sale.customerId === null ? ' (walk-in)' : ''}`
      : null,
    lines: sale.items.map(receiptLine),
    totals: [
      { label: 'Subtotal', amount: money(sale.subtotalCents) },
      ...(discounted
        ? [
            { label: 'Less VAT (12%)', amount: `−${money(sale.vatExemptionCents)}` },
            {
              label: `${discountName(sale)} Discount (20%)`,
              amount: `−${money(sale.discountCents)}`
            }
          ]
        : []),
      { label: 'TOTAL', amount: money(sale.totalCents), strong: true }
    ],
    payment: [
      { label: 'Cash', amount: money(sale.cashCents) },
      { label: 'Change', amount: money(sale.changeCents) }
    ]
  }
}

const WIDTH = 40
const pad = (left: string, right: string): string =>
  left.length + right.length + 1 > WIDTH
    ? `${left}\n${right.padStart(WIDTH)}`
    : `${left}${' '.repeat(WIDTH - left.length - right.length)}${right}`
const center = (text: string): string =>
  text
    .match(new RegExp(`.{1,${WIDTH}}(\\s|$)`, 'g'))!
    .map((line) => {
      const value = line.trim()
      return ' '.repeat(Math.max(0, Math.floor((WIDTH - value.length) / 2))) + value
    })
    .join('\n')
const wrap = (text: string): string =>
  (text.match(new RegExp(`.{1,${WIDTH}}(\\s|$)|\\S+`, 'g')) ?? [text])
    .map((line) => line.trimEnd())
    .join('\n')

/** Fixed-width (40 column) text receipt, laid out like a thermal printer slip. */
export function receiptPlainText(sale: SaleRecord): string {
  const model = receiptModel(sale)
  const dashed = '-'.repeat(WIDTH)
  return [
    center(business.name.toUpperCase()),
    center(business.address),
    center('SALES RECEIPT'),
    dashed,
    pad(`DATE: ${model.date}`, `TIME: ${model.time}`),
    `RECEIPT NO: ${model.number}`,
    wrap(`REF: ${model.reference}`),
    `CASHIER: ${model.cashier}`,
    wrap(`CUSTOMER: ${model.customer}`),
    ...(model.discountLine ? [wrap(model.discountLine)] : []),
    dashed,
    ...model.lines.flatMap((line) => [
      wrap(line.name),
      pad(`  ${line.quantity}`, line.amount),
      wrap(`  ${line.meta}`)
    ]),
    dashed,
    ...model.totals.map((row) =>
      row.strong
        ? `${'='.repeat(WIDTH)}\n${pad(row.label, row.amount)}`
        : pad(row.label.toUpperCase(), row.amount)
    ),
    ...model.payment.map((row) => pad(row.label.toUpperCase(), row.amount)),
    dashed,
    center(`*${model.number}*`),
    center('Thank you for your purchase!')
  ].join('\n')
}

export const escapeHtml = (value: unknown): string =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** Print-ready 80 mm receipt for PDF export; same content and order as the on-screen receipt. */
export function receiptHtml(sale: SaleRecord): string {
  const model = receiptModel(sale)
  const row = (label: string, amount: string, className = ''): string =>
    `<div class="row ${className}"><span>${escapeHtml(label)}</span><span>${escapeHtml(amount)}</span></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(model.number)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Consolas', 'Courier New', monospace; font-size: 11px; color: #000; }
  .center { text-align: center; }
  .logo { width: 34px; height: 34px; border: 2px solid #000; border-radius: 50%; margin: 0 auto 4px; font: bold 22px/30px Arial, sans-serif; }
  .name { font-weight: 700; font-size: 13px; text-transform: uppercase; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  .solid { border-top: 1px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:last-child { text-align: right; white-space: nowrap; }
  .item { margin-bottom: 4px; }
  .item b { display: block; }
  .muted { font-size: 10px; }
  .total { font-weight: 700; font-size: 14px; }
  .wrap { word-break: break-all; }
</style></head><body>
<div class="center"><div class="logo">+</div><div class="name">${escapeHtml(business.name)}</div><div>${escapeHtml(business.address)}</div><div><b>SALES RECEIPT</b></div></div>
<div class="rule"></div>
${row(`DATE: ${model.date}`, `TIME: ${model.time}`)}
<div>RECEIPT NO: ${escapeHtml(model.number)}</div>
<div class="wrap muted">REF: ${escapeHtml(model.reference)}</div>
<div>CASHIER: ${escapeHtml(model.cashier)}</div>
<div>CUSTOMER: ${escapeHtml(model.customer)}</div>
${model.discountLine ? `<div>${escapeHtml(model.discountLine)}</div>` : ''}
<div class="rule"></div>
${model.lines
  .map(
    (line) =>
      `<div class="item"><b>${escapeHtml(line.name)}</b>${row(line.quantity, line.amount)}<div class="muted">${escapeHtml(line.meta)}</div></div>`
  )
  .join('')}
<div class="rule"></div>
${model.totals.map((item) => (item.strong ? `<div class="solid"></div>${row(item.label, item.amount, 'total')}` : row(item.label.toUpperCase(), item.amount))).join('')}
${model.payment.map((item) => row(item.label.toUpperCase(), item.amount)).join('')}
<div class="rule"></div>
<div class="center">${barcodeSvg(model.number, 44)}<div>${escapeHtml(model.number)}</div><div style="margin-top:6px">Thank you for your purchase!</div></div>
</body></html>`
}
