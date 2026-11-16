import z from 'zod'
import { localDate, yearsFromToday } from './inventory'
import { currencyAmount, isoDateSchema, referenceText } from './schemas'
import { supplierReturnReasons, type SupplierReturnReason } from './types'
import { phoneKey } from './duplicates'
import { piecesPerBoxSchema } from './units'

/**
 * Rules for the pharmacy controls added from the November 15 fix list: the supplier price list,
 * voids, cash counts, stock counts, supplier returns and credit notes, and customer merges.
 */

const id = z.number().int().positive()
const optionalReference = (max: number): z.ZodType<string | null> =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^([A-Za-z0-9][A-Za-z0-9 ./#_()-]*)?$/, 'Use letters, numbers and - / . # _ ( ).')
    .transform((value) => value || null)
    .nullable()
    .default(null) as unknown as z.ZodType<string | null>
const reasonText = (message: string, min = 5): z.ZodString =>
  z.string().trim().min(min, message).max(300, 'Keep the reason under 300 characters.')

// Supplier price list --------------------------------------------------------------------------

const priceFields = {
  unitCost: currencyAmount.refine((value) => value >= 0.01, 'Cost per box must be at least ₱0.01.'),
  effectiveFrom: isoDateSchema('Enter the date this price takes effect.'),
  quotationReference: optionalReference(80)
}
const checkEffectiveDate = (value: { effectiveFrom: string }, context: z.RefinementCtx): void => {
  if (value.effectiveFrom > yearsFromToday(1))
    context.addIssue({
      code: 'custom',
      path: ['effectiveFrom'],
      message: 'The effective date must be within one year from today.'
    })
}
export const newPackSchema = z
  .strictObject({ supplierId: id, drugId: id, piecesPerBox: piecesPerBoxSchema, ...priceFields })
  .superRefine(checkEffectiveDate)
export const packPriceSchema = z
  .strictObject({ packId: id, ...priceFields })
  .superRefine(checkEffectiveDate)
export type NewPack = z.input<typeof newPackSchema>
export type PackPrice = z.input<typeof packPriceSchema>

export interface PackPriceRecord {
  id: number
  unitCost: number
  effectiveFrom: string
  quotationReference: string | null
  recordedByName: string | null
  createdAt: string
}
export interface SupplierPackRecord {
  id: number
  supplierId: number
  supplierName: string
  drugId: number
  productName: string
  piecesPerBox: number
  isArchived: boolean
  /** Price in effect today; null when the first price starts later. */
  current: PackPriceRecord | null
  /** A price that starts after today, if one is set. */
  upcoming: PackPriceRecord | null
  history: PackPriceRecord[]
}
export interface PriceDifferenceRecord {
  id: number
  deliveredAt: string
  orderNumber: string
  supplierName: string
  productName: string
  orderedUnitCost: number
  invoiceUnitCost: number
  orderedPiecesPerBox: number
  deliveredPiecesPerBox: number
  reason: string | null
  recordedByName: string
}

/** Label for a pack in pickers: "Box of 100 pcs · ₱500.00". */
export const packLabel = (piecesPerBox: number, unitCost: number | null): string =>
  `Box of ${piecesPerBox} pc${piecesPerBox === 1 ? '' : 's'}${unitCost === null ? ' · no price yet' : ` · ₱${unitCost.toFixed(2)}`}`

// Voids ----------------------------------------------------------------------------------------

export const voidSaleSchema = z.strictObject({
  saleId: id,
  reason: reasonText('Say why the sale is voided (at least 5 characters).'),
  /** True when the medicines came back to the counter; false when the customer kept them. */
  itemsReturned: z.boolean({ error: 'Say whether the medicines came back to the counter.' }),
  /** An administrator's sign-in, required when the person voiding is not an administrator. */
  approval: z
    .strictObject({
      username: z.string().trim().min(1, "Enter the administrator's username.").max(80),
      password: z.string().min(1, "Enter the administrator's password.").max(128)
    })
    .nullable()
    .default(null)
})
export type VoidSale = z.input<typeof voidSaleSchema>

// Cash count -----------------------------------------------------------------------------------

/** Philippine bills and coins in the drawer, largest first, in pesos. */
export const denominations = ['1000', '500', '200', '100', '50', '20', '10', '5', '1', '0.25'] as const
export type Denomination = (typeof denominations)[number]
export const denominationCents = (value: Denomination): number => Math.round(Number(value) * 100)
export const cashCountSchema = z.strictObject({
  openingFloatCents: z.number().int().min(0).max(100_000_000),
  denominations: z
    .partialRecord(z.enum(denominations), z.number().int().min(0, "Enter 0 or more.").max(100_000))
    .default({}),
  notes: z.string().trim().max(300).default('')
})
export type CashCountInput = z.input<typeof cashCountSchema>
export const countedCents = (pieces: Partial<Record<Denomination, number>>): number =>
  denominations.reduce((sum, value) => sum + denominationCents(value) * (pieces[value] ?? 0), 0)
export interface CashCountPreview {
  businessDate: string
  cashSalesCents: number
  cashSalesCount: number
  /** E-wallet sales are not in the drawer; shown for completeness. */
  ewalletSalesCents: number
  voidedCount: number
  /** This cashier's latest count for today; a new count replaces it and needs a reason. */
  previousCountId: number | null
}
export interface CashCountRecord {
  id: number
  cashierId: number
  cashierName: string
  businessDate: string
  openingFloatCents: number
  cashSalesCents: number
  cashSalesCount: number
  expectedCents: number
  countedCents: number
  differenceCents: number
  denominations: Partial<Record<Denomination, number>>
  notes: string | null
  countedByName: string
  createdAt: string
  /** The earlier count of the same day that this recount replaces. */
  recountOf: number | null
  /** Set when a later recount of the same day replaced this count. */
  replacedBy: number | null
}
export const overShortLabel = (differenceCents: number): string =>
  differenceCents === 0 ? 'Balanced' : differenceCents > 0 ? 'Over' : 'Short'

// Stock counts ---------------------------------------------------------------------------------

export const startCountSchema = z.strictObject({
  drugId: id.nullable().default(null),
  notes: z.string().trim().max(300).default('')
})
export const countLinesSchema = z.strictObject({
  countId: id,
  lines: z
    .array(
      z.strictObject({
        batchId: id,
        counted: z.number().int().min(0, 'Enter 0 or more.').max(1_000_000_000).nullable(),
        reason: z.string().trim().max(300).default('')
      })
    )
    .max(5000)
})
export interface StockCountLine {
  batchId: number
  productName: string
  batchNumber: string
  expiresAt: string
  piecesPerBox: number
  expected: number
  counted: number | null
  reason: string | null
  /** Batch stock now; differs from expected when stock moved after the count started. */
  currentStock: number
  /**
   * System stock when this line's count was saved. The correction is counted − this, so sales
   * made while counting are not subtracted twice. Null until saved (or on older counts).
   */
  stockAtCount: number | null
  unitCost: number
}
export interface StockCountRecord {
  id: number
  status: 'open' | 'completed' | 'cancelled'
  scope: string
  notes: string | null
  startedByName: string
  startedAt: string
  closedByName: string | null
  closedAt: string | null
  lineCount: number
  countedCount: number
  differenceCount: number
}
export interface StockCountDetails extends StockCountRecord {
  lines: StockCountLine[]
}

// Supplier returns and credit notes ------------------------------------------------------------

export const supplierReturnSchema = z
  .strictObject({
    batchId: id,
    quantity: z.number().int().positive('Enter the pieces returned.').max(1_000_000_000),
    reasonCode: z.enum(
      Object.keys(supplierReturnReasons) as [SupplierReturnReason, ...SupplierReturnReason[]],
      { error: 'Choose why the stock is returned.' }
    ),
    notes: z.string().trim().max(300).default(''),
    returnedAt: isoDateSchema('Enter the return date.')
  })
  .superRefine((value, context) => {
    if (value.returnedAt > localDate())
      context.addIssue({
        code: 'custom',
        path: ['returnedAt'],
        message: 'The return date cannot be in the future.'
      })
    if (value.reasonCode === 'other' && value.notes.length < 3)
      context.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Describe why the stock is returned.'
      })
  })
export const creditNoteSchema = z
  .strictObject({
    supplierId: id,
    creditNoteNumber: referenceText(80),
    issuedAt: isoDateSchema('Enter the credit note date.'),
    amount: currencyAmount.refine((value) => value >= 0.01, 'Amount must be at least ₱0.01.'),
    /** Purchase order whose balance the credit lowers; null keeps it for the next order. */
    purchaseOrderId: id.nullable().default(null),
    returnIds: z.array(id).max(500).default([]),
    notes: z.string().trim().max(300).default('')
  })
  .refine((value) => value.issuedAt <= localDate(), {
    path: ['issuedAt'],
    message: 'The credit note date cannot be in the future.'
  })
export const applyCreditSchema = z.strictObject({ creditNoteId: id, purchaseOrderId: id })
export type SupplierReturnInput = z.input<typeof supplierReturnSchema>
export type CreditNoteInput = z.input<typeof creditNoteSchema>
export interface SupplierReturnRecord {
  id: number
  supplierId: number
  supplierName: string
  productName: string
  batchNumber: string
  quantity: number
  /** Cost of the pieces returned (batch cost per piece × pieces). */
  costValue: number
  reasonCode: SupplierReturnReason
  notes: string | null
  returnedAt: string
  creditNoteId: number | null
  creditNoteNumber: string | null
  recordedByName: string
}
export interface CreditNoteRecord {
  id: number
  supplierId: number
  supplierName: string
  creditNoteNumber: string
  issuedAt: string
  amount: number
  purchaseOrderId: number | null
  orderNumber: string | null
  appliedAt: string | null
  notes: string | null
  recordedByName: string
  returnCount: number
}

// Customers ------------------------------------------------------------------------------------

export const mergeCustomersSchema = z
  .strictObject({ sourceId: id, targetId: id })
  .refine((value) => value.sourceId !== value.targetId, {
    path: ['targetId'],
    message: 'Choose a different record to keep.'
  })
/** Why a record cannot be deleted, with the counts that block it. */
export interface DeleteBlock {
  reason: string
  archivable: boolean
}

/** A saved record that looks like the one being added. */
export interface DuplicateMatch {
  id: number
  fullName: string
  detail: string
}

/** Distinguishing detail shown next to a name: last 4 of the mobile, the discount ID or the address. */
export const customerDetail = (customer: {
  phone: string
  discountId: string | null
  address: string | null
  clientType: 'retail' | 'pharmacy'
}): string =>
  customer.clientType === 'pharmacy'
    ? customer.address || `mobile ending ${phoneKey(customer.phone).slice(-4)}`
    : [
        `mobile ending ${phoneKey(customer.phone).slice(-4)}`,
        customer.discountId && `ID ${customer.discountId}`
      ]
        .filter(Boolean)
        .join(' · ')

// Dangerous drugs register ----------------------------------------------------------------------

export interface RegisterEntry {
  at: string
  kind: 'received' | 'dispensed' | 'void' | 'wholesale' | 'write_off' | 'supplier_return' | 'count'
  batchNumber: string
  quantityIn: number
  quantityOut: number
  balance: number
  supplier: string | null
  patient: string | null
  prescriptionNumber: string | null
  s2License: string | null
  practitioner: string | null
  reference: string
  remarks: string
}
export interface DrugRegister {
  drugId: number
  productName: string
  isControlled: boolean
  from: string
  to: string
  openingBalance: number
  closingBalance: number
  stockOnHand: number
  /** Pieces on hand that no recorded movement explains (stock entered before this register). */
  unexplained: number
  entries: RegisterEntry[]
}
