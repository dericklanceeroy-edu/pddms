import type {
  PurchaseOrderFormValues,
  PurchaseOrderRecord,
  SupplierFormValues
} from '@renderer/data/supplierOrders'
import { channels } from '@shared/constants'
import {
  newPurchaseOrderSchema,
  newSupplierSchema,
  purchaseOrderDeliverySchema,
  purchaseOrderStatusUpdateSchema,
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
  items: Array<{ itemId: number; receivedQuantity: number }>
): Promise<PurchaseOrderRecord> {
  const payload = validate(purchaseOrderDeliverySchema, { items })
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
