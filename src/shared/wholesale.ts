import z from 'zod'
import { localDate } from './inventory'
import { cartLineSchema, centsSchema, lineText, money, type SaleLine } from './sales'
import { isoDateSchema, paymentMethodSchema } from './schemas'
import { boxOnlyUnitSchema } from './units'

export class WholesaleError extends Error {}
export const orderStatuses = ['pending', 'scheduled', 'delivered', 'cancelled'] as const
export type WholesaleStatus = (typeof orderStatuses)[number]
const id = z.number().int().positive()
// Note: Wholesale is sold to other pharmacies by the box only.
const wholesaleLineSchema = cartLineSchema.extend({ unit: boxOnlyUnitSchema.default('box') })
// Note: Names of people outside the system (drivers, client staff) are typed, not picked from accounts.
const personName = z
  .string()
  .trim()
  .max(120, 'Name is too long.')
  .regex(
    /^(\p{L}[\p{L} .,'-]*)?$/u,
    'Use letters, spaces, periods, commas, apostrophes or hyphens.'
  )
const requiredPersonName = (message: string): z.ZodString => personName.min(2, message)
export const wholesaleOrderSchema = z
  .strictObject({
    requestId: z.string().uuid(),
    customerId: z
      .number({ error: 'Select a pharmacy client.' })
      .int()
      .positive('Select a pharmacy client.'),
    dueDate: isoDateSchema('Enter a valid payment due date.'),
    deliveryAddress: z.string().trim().min(1, 'Delivery address is required.').max(500),
    notes: z.string().trim().max(500),
    // Note: Delivery is scheduled while the order is created, in the same step.
    scheduledDate: isoDateSchema('Enter a valid delivery date.'),
    deliveryNotes: z.string().trim().max(500).default(''),
    driverName: personName.default(''),
    items: z.array(wholesaleLineSchema).min(1, 'Add at least one product.').max(200)
  })
  .refine(
    (value) => new Set(value.items.map((item) => item.batchId)).size === value.items.length,
    'Each batch must appear only once.'
  )
  .refine((value) => value.dueDate >= localDate(), {
    path: ['dueDate'],
    message: 'The payment due date cannot be before the order date (today).'
  })
  .refine((value) => value.scheduledDate >= localDate(), {
    path: ['scheduledDate'],
    message: 'The delivery date cannot be before the order date (today).'
  })
export const wholesaleScheduleSchema = z.strictObject({
  orderId: id,
  scheduledDate: isoDateSchema('Enter a valid delivery date.'),
  deliveryAddress: z.string().trim().min(1).max(500),
  deliveryNotes: z.string().trim().max(500),
  driverName: personName.default('')
})
export const wholesaleDeliverSchema = z.strictObject({
  orderId: id,
  driverName: requiredPersonName('Enter who delivered the order (driver or courier).'),
  receivedByName: requiredPersonName('Enter who received the order at the client.')
})
export const wholesalePaymentSchema = z
  .strictObject({
    paymentId: id.optional(),
    orderId: id,
    amountCents: centsSchema.refine((value) => value > 0, 'Payment must be greater than zero.'),
    paidAt: isoDateSchema('Enter a valid payment date.'),
    reference: z
      .string()
      .trim()
      .min(1, 'Payment reference is required.')
      .max(120, 'Payment reference must be 120 characters or fewer.')
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9 ./#_()-]*$/,
        'Payment reference may use only letters, numbers, spaces and - / . # _ ( ).'
      ),
    method: paymentMethodSchema,
    notes: z.string().trim().max(500)
  })
  .refine((value) => value.paidAt <= localDate(), {
    path: ['paidAt'],
    message: 'Payment date cannot be in the future.'
  })
export const wholesaleListSchema = z.strictObject({
  beforeId: id.optional(),
  search: z.string().trim().max(100).default(''),
  status: z.enum(orderStatuses).optional(),
  overdue: z.boolean().default(false)
})
export type WholesaleDraft = z.input<typeof wholesaleOrderSchema>
export type WholesaleSchedule = z.input<typeof wholesaleScheduleSchema>
export type WholesaleDelivery = z.infer<typeof wholesaleDeliverSchema>
export type WholesalePaymentInput = z.infer<typeof wholesalePaymentSchema>
export type WholesaleFilter = z.input<typeof wholesaleListSchema>
export interface WholesaleOrder {
  id: number
  requestId: string
  requestFingerprint: string
  reference: string
  customerId: number
  customerName: string
  customerPhone: string
  createdBy: number
  createdAt: string
  orderDate: string
  dueDate: string
  totalCents: number
  status: WholesaleStatus
  notes: string
  scheduledDate: string | null
  deliveryAddress: string
  deliveryNotes: string
  deliveredAt: string | null
  /** Account that recorded the delivery in the system. */
  deliveredByName: string | null
  scheduledByName: string | null
  scheduledAt: string | null
  /** Driver or courier who brought the goods to the client. */
  driverName: string | null
  /** Person at the client who received the goods. */
  receivedByName: string | null
  cancelledByName: string | null
  cancelledAt: string | null
}
export interface WholesalePayment extends Omit<WholesalePaymentInput, 'paymentId'> {
  id: number
  recordedBy: number
  createdAt: string
  updatedAt: string
  updatedBy: number
}
export interface Receivable {
  paidCents: number
  remainingCents: number
  paymentStatus: 'paid' | 'partially_paid' | 'outstanding'
  deadlineStatus: 'paid' | 'overdue' | 'upcoming'
}
export type WholesaleSummary = Omit<WholesaleOrder, 'requestFingerprint'> & {
  createdByName: string
  receivable?: Receivable
}
export type WholesalePaymentDetails = WholesalePayment & {
  recordedByName: string
  updatedByName: string
}
export type WholesaleDetails = WholesaleSummary & {
  items: SaleLine[]
  payments?: WholesalePaymentDetails[]
}
export function receivable(
  total: number,
  paid: number,
  dueDate: string,
  today = localDate()
): Receivable {
  const remainingCents = total - paid
  return {
    paidCents: paid,
    remainingCents,
    paymentStatus: remainingCents === 0 ? 'paid' : paid > 0 ? 'partially_paid' : 'outstanding',
    deadlineStatus: remainingCents === 0 ? 'paid' : dueDate < today ? 'overdue' : 'upcoming'
  }
}
export function deliveryReceiptText(order: WholesaleDetails): string {
  if (order.status !== 'delivered' || !order.deliveredAt)
    throw new WholesaleError('Record delivery before generating proof of delivery.')
  return [
    'Med Prix Distributor and Pharmacy',
    'G Mesa St, General Santos City (Dadiangas), South Cotabato',
    'DELIVERY RECEIPT',
    `DR-${order.reference}`,
    `Order: ${order.reference}`,
    `Client: ${order.customerName}`,
    `Contact: ${order.customerPhone}`,
    `Delivery address: ${order.deliveryAddress}`,
    `Delivered: ${new Date(order.deliveredAt).toLocaleString('en-PH')}`,
    `Status: ${order.status}`,
    ...order.items.map((item) => lineText(item)),
    `Order total: ${money(order.totalCents)}`,
    `Delivery notes: ${order.deliveryNotes || '—'}`,
    `Order created by: ${order.createdByName}`,
    `Scheduled by: ${order.scheduledByName ?? 'Not recorded'}`,
    `Delivery recorded by: ${order.deliveredByName}`,
    `Delivered by: ${order.driverName ?? 'Not recorded'} / signature: ____________________`,
    `Received by: ${order.receivedByName ?? 'Not recorded'} / signature: ____________________`,
    'Proof of delivery — not a payment receipt.'
  ].join('\n\n')
}
