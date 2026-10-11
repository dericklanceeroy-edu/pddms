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
  requestId: string
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
  fileToken: string
  purchaseOrderId: number
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  amount: number
}

export interface SelectedInvoiceFile {
  token: string
  name: string
  size: number
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
  draft: 'bg-slate-100 text-slate-700',
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

/**
 * Plain-language explanation of what can still happen to an order in each status.
 */
export const orderStatusHelp: Record<OrderStatus, string> = {
  draft: 'Not yet sent to the supplier. You can still edit, submit, cancel or delete it.',
  submitted: 'Sent to the supplier and waiting for delivery. Record deliveries as stock arrives.',
  partially_received:
    'Some stock has arrived. Record the remaining deliveries, or cancel the undelivered balance.',
  received: 'All ordered stock has been received. The order is complete.',
  cancelled:
    'Cancelled orders are closed permanently. Received stock and payments remain on record.'
}

export type ProcurementTab = 'suppliers' | 'orders' | 'receiving' | 'invoices' | 'history'

export const procurementTabs: Array<{ id: ProcurementTab; label: string }> = [
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'orders', label: 'Purchase orders' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'invoices', label: 'Invoices & payments' },
  { id: 'history', label: 'History' }
]
