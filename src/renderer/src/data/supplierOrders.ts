import type {
  PurchaseOrderPaymentSummary,
  PurchaseOrderStatus,
  PurchaseOrderWithDetails,
  Supplier,
  SupplierDeliveryWithDetails,
  SupplierInvoiceWithDetails,
  SupplierPaymentWithDetails
} from '@shared/types'

export type SupplierFormValues = Omit<Supplier, 'id'>

export interface PurchaseOrderLineDraft {
  drugId: number
  quantity: number
  unitCost: number
}

export interface PurchaseOrderFormValues {
  supplierId: number
  expectedAt: string | null
  notes: string | null
  items: PurchaseOrderLineDraft[]
}

export interface DeliveryFormValues {
  deliveredAt: string
  notes: string | null
  items: Array<{
    itemId: number
    receivedQuantity: number
    batchNumber: string
    sellPrice: number
    expiresAt: string
  }>
}

export interface InvoiceUploadValues {
  purchaseOrderId: number
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  amount: number
}

export interface SupplierPaymentValues {
  purchaseOrderId: number
  invoiceId: number | null
  amount: number
  paidAt: string
  method: string
  referenceNumber: string | null
  notes: string | null
}

export type DeliveryRecord = SupplierDeliveryWithDetails
export type InvoiceRecord = SupplierInvoiceWithDetails
export type PaymentRecord = SupplierPaymentWithDetails
export type PaymentSummary = PurchaseOrderPaymentSummary

export type PurchaseOrderRecord = PurchaseOrderWithDetails
export type OrderStatus = PurchaseOrderStatus

export const orderStatusLabels: Record<OrderStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  partially_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled'
}

export const orderStatusTone: Record<OrderStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-700',
  submitted: 'bg-amber-50 text-amber-800',
  partially_received: 'bg-sky-50 text-sky-800',
  received: 'bg-emerald-50 text-emerald-800',
  cancelled: 'bg-rose-50 text-rose-700'
}

export const deadlineLabels: Record<InvoiceRecord['deadlineStatus'], string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  upcoming: 'Upcoming',
  paid: 'Paid'
}

export const deadlineTone: Record<InvoiceRecord['deadlineStatus'], string> = {
  overdue: 'bg-rose-50 text-rose-700',
  due_soon: 'bg-amber-50 text-amber-800',
  upcoming: 'bg-sky-50 text-sky-800',
  paid: 'bg-emerald-50 text-emerald-800'
}
