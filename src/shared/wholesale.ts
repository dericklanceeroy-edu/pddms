import z from 'zod'
import { localDate } from './inventory'
import { cartLineSchema, centsSchema, money, type SaleLine } from './sales'
import { isoDateSchema } from './schemas'

export class WholesaleError extends Error {}
export const orderStatuses = ['pending', 'scheduled', 'delivered', 'cancelled'] as const
export type WholesaleStatus = (typeof orderStatuses)[number]
const id = z.number().int().positive()
export const wholesaleOrderSchema = z
  .strictObject({
    requestId: z.string().uuid(),
    customerId: id,
    dueDate: isoDateSchema('Enter a valid payment due date.'),
    deliveryAddress: z.string().trim().min(1, 'Delivery address is required.').max(500),
    notes: z.string().trim().max(500),
    items: z.array(cartLineSchema).min(1, 'Add at least one product.').max(200)
  })
  .refine(
    (value) => new Set(value.items.map((item) => item.batchId)).size === value.items.length,
    'Each batch must appear only once.'
  )
export const wholesaleScheduleSchema = z.strictObject({
  orderId: id,
  scheduledDate: isoDateSchema('Enter a valid delivery date.'),
  deliveryAddress: z.string().trim().min(1).max(500),
  deliveryNotes: z.string().trim().max(500)
})
export const wholesalePaymentSchema = z
  .strictObject({
    paymentId: id.optional(),
    orderId: id,
    amountCents: centsSchema.refine((value) => value > 0, 'Payment must be greater than zero.'),
    paidAt: isoDateSchema('Enter a valid payment date.'),
    reference: z.string().trim().min(1, 'Payment reference is required.').max(120),
    method: z.string().trim().min(1).max(80),
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
export type WholesaleDraft = z.infer<typeof wholesaleOrderSchema>
export type WholesaleSchedule = z.infer<typeof wholesaleScheduleSchema>
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
  deliveredByName: string | null
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
  receivable?: Receivable
}
export type WholesaleDetails = WholesaleSummary & {
  items: SaleLine[]
  payments?: WholesalePayment[]
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
    'Med Prix Drug Distributor and Pharmacy',
    'G Mesa St, General Santos City (Dadiangas), South Cotabato',
    'DELIVERY RECEIPT',
    `DR-${order.reference}`,
    `Order: ${order.reference}`,
    `Client: ${order.customerName}`,
    `Contact: ${order.customerPhone}`,
    `Delivery address: ${order.deliveryAddress}`,
    `Delivered: ${new Date(order.deliveredAt).toLocaleString('en-PH')}`,
    `Status: ${order.status}`,
    ...order.items.map(
      (item) =>
        `${item.productName}\nBatch ${item.batchNumber} | Expiry ${item.expiresAt}\n${item.quantity} × ${money(item.unitPriceCents)} = ${money(item.quantity * item.unitPriceCents)}`
    ),
    `Order total: ${money(order.totalCents)}`,
    `Delivery notes: ${order.deliveryNotes || '—'}`,
    `Recorded by: ${order.deliveredByName}`,
    'Received by / signature: ____________________',
    'Delivered by / signature: ____________________',
    'Proof of delivery — not a payment receipt.'
  ].join('\n\n')
}
