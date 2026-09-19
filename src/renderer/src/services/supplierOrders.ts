import type {
  DeliveryFormValues,
  DeliveryRecord,
  InvoiceRecord,
  InvoiceUploadValues,
  PaymentRecord,
  PaymentSummary,
  PurchaseOrderFormValues,
  PurchaseOrderRecord,
  SupplierFormValues,
  SupplierPaymentValues
} from '@renderer/data/supplierOrders'
import { channels } from '@shared/constants'
import {
  newPurchaseOrderSchema,
  newSupplierSchema,
  purchaseOrderDeliverySchema,
  purchaseOrderStatusUpdateSchema,
  supplierInvoiceUploadSchema,
  supplierPaymentSchema,
  supplierUpdateSchema
} from '@shared/schemas'
import type { PurchaseOrderStatus, Supplier } from '@shared/types'
import { validate } from '@shared/validation'

interface SupplierResult {
  success: boolean
  suppliers?: Supplier[]
  supplier?: Supplier
  error?: string
}

interface OrderResult {
  success: boolean
  orders?: PurchaseOrderRecord[]
  order?: PurchaseOrderRecord
  error?: string
}

interface ProcurementResult {
  success: boolean
  cancelled?: boolean
  deliveries?: DeliveryRecord[]
  invoices?: InvoiceRecord[]
  payments?: PaymentRecord[]
  paymentSummaries?: PaymentSummary[]
  invoice?: InvoiceRecord
  payment?: PaymentRecord
  error?: string
}

export async function getSuppliers(): Promise<Supplier[]> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.supplier.getAll
  )) as SupplierResult
  if (!result.success) throw new Error(result.error ?? 'Unable to load suppliers.')
  return result.suppliers ?? []
}

export async function saveSupplier(values: SupplierFormValues, id?: number): Promise<Supplier> {
  const payload = validate(id ? supplierUpdateSchema : newSupplierSchema, values)
  const result = (await window.electron.ipcRenderer.invoke(
    id ? channels.supplier.updateOneById : channels.supplier.createOne,
    ...(id ? [id, payload] : [payload])
  )) as SupplierResult
  if (!result.success || !result.supplier) {
    throw new Error(result.error ?? 'Unable to save the supplier.')
  }
  return result.supplier
}

export async function removeSupplier(id: number): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.supplier.removeOneById,
    id
  )) as SupplierResult
  if (!result.success) throw new Error(result.error ?? 'Unable to remove the supplier.')
}

export async function getPurchaseOrders(): Promise<PurchaseOrderRecord[]> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.purchaseOrder.getAll
  )) as OrderResult
  if (!result.success) throw new Error(result.error ?? 'Unable to load purchase orders.')
  return result.orders ?? []
}

export async function createPurchaseOrder(
  values: PurchaseOrderFormValues
): Promise<PurchaseOrderRecord> {
  const payload = validate(newPurchaseOrderSchema, values)
  const result = (await window.electron.ipcRenderer.invoke(
    channels.purchaseOrder.createOne,
    payload
  )) as OrderResult
  if (!result.success || !result.order) {
    throw new Error(result.error ?? 'Unable to create the purchase order.')
  }
  return result.order
}

export async function updatePurchaseOrderStatus(
  id: number,
  status: PurchaseOrderStatus
): Promise<PurchaseOrderRecord> {
  const payload = validate(purchaseOrderStatusUpdateSchema, { status })
  const result = (await window.electron.ipcRenderer.invoke(
    channels.purchaseOrder.updateStatusById,
    id,
    payload
  )) as OrderResult
  if (!result.success || !result.order) {
    throw new Error(result.error ?? 'Unable to update the purchase order.')
  }
  return result.order
}

export async function receivePurchaseOrder(
  id: number,
  values: DeliveryFormValues
): Promise<PurchaseOrderRecord> {
  const payload = validate(purchaseOrderDeliverySchema, values)
  const result = (await window.electron.ipcRenderer.invoke(
    channels.purchaseOrder.recordDeliveryById,
    id,
    payload
  )) as OrderResult
  if (!result.success || !result.order) {
    throw new Error(result.error ?? 'Unable to record the delivery.')
  }
  return result.order
}

export async function removePurchaseOrder(id: number): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.purchaseOrder.removeOneById,
    id
  )) as OrderResult
  if (!result.success) throw new Error(result.error ?? 'Unable to remove the purchase order.')
}

export async function getProcurementRecords(): Promise<{
  deliveries: DeliveryRecord[]
  invoices: InvoiceRecord[]
  payments: PaymentRecord[]
  paymentSummaries: PaymentSummary[]
}> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.procurement.getRecords
  )) as ProcurementResult
  if (!result.success) throw new Error(result.error ?? 'Unable to load procurement records.')
  return {
    deliveries: result.deliveries ?? [],
    invoices: result.invoices ?? [],
    payments: result.payments ?? [],
    paymentSummaries: result.paymentSummaries ?? []
  }
}

export async function uploadSupplierInvoice(
  values: InvoiceUploadValues
): Promise<InvoiceRecord | null> {
  const payload = validate(supplierInvoiceUploadSchema, values)
  const result = (await window.electron.ipcRenderer.invoke(
    channels.procurement.uploadInvoice,
    payload
  )) as ProcurementResult
  if (!result.success) throw new Error(result.error ?? 'Unable to upload the supplier invoice.')
  if (result.cancelled) return null
  if (!result.invoice) throw new Error('The supplier invoice was not returned after upload.')
  return result.invoice
}

export async function openSupplierInvoice(id: number): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.procurement.openInvoice,
    id
  )) as ProcurementResult
  if (!result.success) throw new Error(result.error ?? 'Unable to open the supplier invoice.')
}

export async function createSupplierPayment(values: SupplierPaymentValues): Promise<PaymentRecord> {
  const payload = validate(supplierPaymentSchema, values)
  const result = (await window.electron.ipcRenderer.invoke(
    channels.procurement.recordPayment,
    payload
  )) as ProcurementResult
  if (!result.success || !result.payment) {
    throw new Error(result.error ?? 'Unable to record the supplier payment.')
  }
  return result.payment
}
