import z from 'zod'
import { getExpiryStatus, yearsFromToday } from './inventory'
import { quantityLabel, stockUnitSchema, unitWord } from './units'

export class SalesError extends Error {}

export const centsSchema = z.number().int().min(0).max(1_000_000_000)
export const cartLineSchema = z.strictObject({
  batchId: z.number().int().positive(),
  quantity: z.number().int().positive().max(1_000_000),
  unit: stockUnitSchema.default('piece'),
  unitPriceCents: centsSchema
})
// Note: Same ID rules as a saved customer profile, so the walk-in path is not a weaker route.
const discountIdPattern = /^[A-Za-z0-9]+$/
const holderNamePattern = /^\p{L}[\p{L} .,'-]*$/u
export const walkInDiscountSchema = z
  .strictObject({
    discountType: z.enum(['senior', 'pwd']),
    holderName: z
      .string()
      .trim()
      .min(2, "Enter the ID holder's full name.")
      .max(120, 'Name is too long.')
      .regex(holderNamePattern, 'Use letters, spaces, periods, commas, apostrophes or hyphens.'),
    discountId: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s./-]/g, ''))
      .pipe(
        z
          .string()
          .min(4, 'Enter the ID number (at least 4 characters).')
          .max(40, 'ID number is too long.')
          .regex(discountIdPattern, 'ID number may use only letters and numbers.')
      ),
    discountExpiresAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid ID expiry date.')
      .nullable()
  })
  .superRefine((value, context) => {
    if (value.discountType === 'pwd' && !value.discountExpiresAt)
      context.addIssue({
        code: 'custom',
        path: ['discountExpiresAt'],
        message: 'Enter the PWD ID expiry date.'
      })
    if (value.discountExpiresAt && value.discountExpiresAt > yearsFromToday(10))
      context.addIssue({
        code: 'custom',
        path: ['discountExpiresAt'],
        message:
          'Check the expiry date: it is more than 10 years away. Enter the date printed on the ID.'
      })
    if (
      value.discountExpiresAt &&
      ['expired', 'unknown'].includes(getExpiryStatus(value.discountExpiresAt))
    )
      context.addIssue({
        code: 'custom',
        path: ['discountExpiresAt'],
        message: 'This ID is expired or the date is invalid. The discount cannot be applied.'
      })
  })
export type WalkInDiscount = z.infer<typeof walkInDiscountSchema>
/** Key of a cart line: one line per batch and unit, so a box and loose pieces can be sold together. */
export const cartKey = (line: Pick<CartLine, 'batchId' | 'unit'>): string =>
  `${line.batchId}:${line.unit ?? 'piece'}`
export const saleDraftSchema = z
  .strictObject({
    customerId: z.number().int().positive().nullable(),
    walkInDiscount: walkInDiscountSchema.nullable().default(null),
    items: z.array(cartLineSchema).min(1, 'Add an item to the cart.').max(200)
  })
  .refine(
    (value) => new Set(value.items.map(cartKey)).size === value.items.length,
    'Each batch and unit must appear only once in the cart.'
  )
  .refine((value) => value.customerId === null || value.walkInDiscount === null, {
    path: ['walkInDiscount'],
    message: 'Choose either a registered customer or a walk-in Senior/PWD ID, not both.'
  })
/** Ways a retail customer can pay at the counter. */
export const posPaymentMethods = ['Cash', 'GCash', 'Maya'] as const
export type PosPaymentMethod = (typeof posPaymentMethods)[number]
const prescriberPattern = /^\p{L}[\p{L} .,'-]*$/u
const documentPattern = /^[A-Za-z0-9][A-Za-z0-9 ./#_()-]*$/
/** Prescription presented for prescription (Rx) or controlled medicines in the cart. */
export const prescriptionSchema = z.strictObject({
  prescriberName: z
    .string()
    .trim()
    .min(2, "Enter the prescribing doctor's name.")
    .max(120, 'Name is too long.')
    .regex(prescriberPattern, 'Use letters, spaces, periods, commas, apostrophes or hyphens.'),
  prescriberLicense: z
    .string()
    .trim()
    .min(4, "Enter the doctor's PRC license number.")
    .max(40, 'License number is too long.')
    .regex(documentPattern, 'License number may use letters, numbers and - / . # _ ( ).'),
  prescriptionNumber: z
    .string()
    .trim()
    .max(60, 'Prescription number is too long.')
    .regex(
      /^([A-Za-z0-9][A-Za-z0-9 ./#_()-]*)?$/,
      'Prescription number may use letters, numbers and - / . # _ ( ).'
    )
    .default(''),
  // Note: Dangerous drugs register (DDB Board Regulation No. 1 s.2014, drugstore register 1-14):
  // patient name, age and address, prescriber address and S2 license number. Required at checkout
  // when the cart has a controlled medicine.
  patientName: z
    .string()
    .trim()
    .max(120, 'Name is too long.')
    .regex(
      /^(\p{L}[\p{L} .,'-]*)?$/u,
      'Use letters, spaces, periods, commas, apostrophes or hyphens.'
    )
    .default(''),
  patientAge: z
    .number()
    .int()
    .min(0, 'Enter the age in years.')
    .max(130, 'Check the age.')
    .nullable()
    .default(null),
  patientAddress: z.string().trim().max(300, 'Address is too long.').default(''),
  prescriberAddress: z.string().trim().max(300, 'Address is too long.').default(''),
  prescriberS2License: z
    .string()
    .trim()
    .max(40, 'License number is too long.')
    .regex(
      /^([A-Za-z0-9][A-Za-z0-9 ./#_()-]*)?$/,
      'S2 license may use letters, numbers and - / . # _ ( ).'
    )
    .default('')
})
export type Prescription = z.input<typeof prescriptionSchema>
/** Register fields still missing for a sale with a controlled medicine, as readable labels. */
export function missingRegisterFields(
  value: z.infer<typeof prescriptionSchema>,
  hasPatientName: boolean
): string[] {
  return [
    !value.prescriptionNumber && 'prescription (SPFDD) number',
    !hasPatientName && !value.patientName && "patient's name",
    value.patientAge === null && "patient's age",
    value.patientAddress.length < 5 && "patient's address",
    value.prescriberAddress.length < 5 && "doctor's address",
    value.prescriberS2License.length < 3 && "doctor's S2 license number"
  ].filter((item): item is string => !!item)
}
export const checkoutSchema = saleDraftSchema
  .safeExtend({
    requestId: z.string().uuid(),
    expectedTotalCents: centsSchema,
    /** Amount received: cash tendered, or the e-wallet amount transferred. */
    cashCents: centsSchema,
    paymentMethod: z.enum(posPaymentMethods, { error: 'Select a payment method.' }).default('Cash'),
    paymentReference: z
      .string()
      .trim()
      .max(60, 'Reference number is too long.')
      .regex(
        /^([A-Za-z0-9][A-Za-z0-9 ./#_()-]*)?$/,
        'Reference may use letters, numbers and - / . # _ ( ).'
      )
      .nullable()
      .default(null),
    prescription: prescriptionSchema.nullable().default(null)
  })
  .superRefine((value, context) => {
    if (value.paymentMethod !== 'Cash' && !value.paymentReference)
      context.addIssue({
        code: 'custom',
        path: ['paymentReference'],
        message: `Enter the ${value.paymentMethod} reference number.`
      })
  })
export type CartLine = z.infer<typeof cartLineSchema>
export type SaleDraft = z.input<typeof saleDraftSchema>
export type Checkout = z.input<typeof checkoutSchema>
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
/** Discount for a sale: a registered customer's profile, or a walk-in ID checked at the counter. */
export function saleDiscount(
  customer: Eligibility | null,
  walkIn: WalkInDiscount | null | undefined
): DiscountType {
  if (walkIn) return walkInDiscountSchema.parse(walkIn).discountType
  return customerDiscount(customer)
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
  /** Pieces in one unit when the line was sold; stock moves by quantity × piecesPerUnit. */
  piecesPerUnit: number
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
  discountExpiresAt: string | null
  cashCents: number
  changeCents: number
  paymentMethod: PosPaymentMethod
  paymentReference: string | null
  prescriberName: string | null
  prescriberLicense: string | null
  prescriptionNumber: string | null
  /** Dangerous drugs register details, recorded when the sale has a controlled medicine. */
  patientAge: number | null
  patientAddress: string | null
  prescriberAddress: string | null
  prescriberS2License: string | null
  /** A voided sale stays on record but is left out of totals; its stock went back to its batches. */
  status: 'completed' | 'voided'
  voidedAt: string | null
  voidedBy: number | null
  voidedByName: string | null
  voidApprovedByName: string | null
  voidReason: string | null
  /**
   * Whether the voided sale's medicines came back to the counter: 1 back on the shelf, 0 the
   * customer kept them (written off as lost), null for voids made before this was asked (returned).
   */
  voidItemsReturned: number | null
  createdAt: string
  items: SaleLine[]
}
/** A sale in the transactions list. */
export type SaleHistoryRecord = Omit<SaleRecord, 'items'> & {
  /**
   * True when the sale's cashier has saved a cash count after the sale, so it can no longer be
   * voided (the server refuses it either way).
   */
  drawerCounted: boolean
}
export const money = (cents: number): string =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)

export function receiptText(sale: SaleRecord): string {
  return [
    'MED PRIX',
    'Sales receipt',
    ...(sale.status === 'voided'
      ? [`*** VOID *** ${sale.voidedByName ?? ''}: ${sale.voidReason ?? ''}`]
      : []),
    sale.reference,
    new Date(sale.createdAt).toLocaleString('en-PH'),
    `Cashier: ${sale.cashierName}`,
    `Customer: ${sale.customerName}`,
    ...(sale.discountType === 'none'
      ? []
      : [
          `${sale.discountType === 'senior' ? 'Senior Citizen' : 'PWD'} ID: ${sale.discountId ?? '—'}${sale.customerId === null ? ' (walk-in, ID checked at counter)' : ''}`
        ]),
    ...sale.items.map((item) => lineText(item)),
    `Subtotal: ${money(sale.subtotalCents)}`,
    `VAT exemption: ${money(sale.vatExemptionCents)}`,
    `Discount (${sale.discountType}): ${money(sale.discountCents)}`,
    `TOTAL: ${money(sale.totalCents)}`,
    `${sale.paymentMethod === 'Cash' ? 'Cash' : `${sale.paymentMethod} (Ref ${sale.paymentReference})`}: ${money(sale.cashCents)}`,
    `Change: ${money(sale.changeCents)}`
  ].join('\n\n')
}

export const lineText = (item: SaleLine): string =>
  `${item.productName}\nBatch ${item.batchNumber} | Expiry ${item.expiresAt}\n${quantityLabel(item.quantity, item.unit, item.piecesPerUnit)} × ${money(item.unitPriceCents)} per ${unitWord(item.unit, item.piecesPerUnit)} = ${money(item.quantity * item.unitPriceCents)}`

/** `available` is the number of whole units of the line's kind that the batch can fill. */
export function setCartQuantity(cart: CartLine[], line: CartLine, available: number): CartLine[] {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0)
    throw new SalesError('Enter a whole quantity greater than zero, or use Remove.')
  cartLineSchema.parse(line)
  if (line.quantity > available)
    throw new SalesError(
      available > 0
        ? `Only ${available} ${line.unit === 'box' ? 'full box(es)' : 'piece(s)'} available in this batch.`
        : 'Quantity exceeds available batch stock.'
    )
  return cart.some((item) => cartKey(item) === cartKey(line))
    ? cart.map((item) => (cartKey(item) === cartKey(line) ? line : item))
    : [...cart, line]
}
export const removeCartItem = (cart: CartLine[], key: string): CartLine[] =>
  cart.filter((item) => cartKey(item) !== key)
