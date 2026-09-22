import z from 'zod'
import { getExpiryStatus } from './inventory'

export class SalesError extends Error {}

export const centsSchema = z.number().int().min(0).max(1_000_000_000)
export const cartLineSchema = z.strictObject({
  batchId: z.number().int().positive(),
  quantity: z.number().int().positive().max(1_000_000),
  unitPriceCents: centsSchema
})
export const saleDraftSchema = z
  .strictObject({
    customerId: z.number().int().positive().nullable(),
    items: z.array(cartLineSchema).min(1, 'Add an item to the cart.').max(200)
  })
  .refine(
    (value) => new Set(value.items.map((item) => item.batchId)).size === value.items.length,
    'Each batch must appear only once in the cart.'
  )
export const checkoutSchema = saleDraftSchema.safeExtend({
  requestId: z.string().uuid(),
  expectedTotalCents: centsSchema,
  cashCents: centsSchema
})
export type CartLine = z.infer<typeof cartLineSchema>
export type SaleDraft = z.infer<typeof saleDraftSchema>
export type Checkout = z.infer<typeof checkoutSchema>
export type DiscountType = 'none' | 'senior' | 'pwd'
export interface Eligibility {
  discountType: DiscountType
  discountId: string | null
  discountExpiresAt: string | null
}
export function customerDiscount(customer: Eligibility | null): DiscountType {
  if (!customer || customer.discountType === 'none') return 'none'
  if (
    !customer.discountId?.trim() ||
    (customer.discountExpiresAt &&
      ['expired', 'unknown'].includes(getExpiryStatus(customer.discountExpiresAt)))
  )
    throw new SalesError(
      'Customer discount ID is missing, invalid, or expired. Update the customer profile.'
    )
  return customer.discountType
}
export function priceToCents(price: number): number {
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000)
    throw new SalesError('Invalid price. Refresh the catalog or contact an administrator.')
  return Math.round((price + Number.EPSILON) * 100)
}
export function calculateSale(items: CartLine[], discountType: DiscountType): SaleTotals {
  const subtotalCents = items.reduce(
    (total, item) => total + item.quantity * item.unitPriceCents,
    0
  )
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 1_000_000_000)
    throw new SalesError('Transaction amount exceeds the supported limit.')
  const base = discountType === 'none' ? subtotalCents : Math.round((subtotalCents * 100) / 112)
  const discountCents = discountType === 'none' ? 0 : Math.round((base * 20) / 100)
  return {
    subtotalCents,
    vatExemptionCents: subtotalCents - base,
    discountCents,
    totalCents: base - discountCents,
    discountType
  }
}
export interface SaleTotals {
  subtotalCents: number
  vatExemptionCents: number
  discountCents: number
  totalCents: number
  discountType: DiscountType
}
export interface SaleLine extends CartLine {
  drugId: number
  productName: string
  category: string
  batchNumber: string
  expiresAt: string
}
export interface SaleRecord extends SaleTotals {
  id: number
  requestId: string
  reference: string
  cashierId: number
  cashierName: string
  customerId: number | null
  customerName: string
  discountId: string | null
  cashCents: number
  changeCents: number
  createdAt: string
  items: SaleLine[]
}
export const money = (cents: number): string =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)

export function receiptText(sale: SaleRecord): string {
  return [
    'MED PRIX',
    'Sales receipt',
    sale.reference,
    new Date(sale.createdAt).toLocaleString('en-PH'),
    `Cashier: ${sale.cashierName}`,
    `Customer: ${sale.customerName}`,
    ...sale.items.map(
      (item) =>
        `${item.productName}\nBatch ${item.batchNumber} | Expiry ${item.expiresAt}\n${item.quantity} × ${money(item.unitPriceCents)} = ${money(item.quantity * item.unitPriceCents)}`
    ),
    `Subtotal: ${money(sale.subtotalCents)}`,
    `VAT exemption: ${money(sale.vatExemptionCents)}`,
    `Discount (${sale.discountType}): ${money(sale.discountCents)}`,
    `TOTAL: ${money(sale.totalCents)}`,
    `Cash: ${money(sale.cashCents)}`,
    `Change: ${money(sale.changeCents)}`
  ].join('\n\n')
}

export function setCartQuantity(cart: CartLine[], line: CartLine, available: number): CartLine[] {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0)
    throw new SalesError('Enter a whole quantity greater than zero, or use Remove.')
  cartLineSchema.parse(line)
  if (line.quantity > available) throw new SalesError('Quantity exceeds available batch stock.')
  return cart.some((item) => item.batchId === line.batchId)
    ? cart.map((item) => (item.batchId === line.batchId ? line : item))
    : [...cart, line]
}
export const removeCartItem = (cart: CartLine[], batchId: number): CartLine[] =>
  cart.filter((item) => item.batchId !== batchId)
