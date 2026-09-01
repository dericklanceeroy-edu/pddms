import type { PurchaseOrderStatus, PurchaseOrderWithDetails, Supplier } from '@shared/types'

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
