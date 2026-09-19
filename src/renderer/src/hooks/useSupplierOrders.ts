import type { ItemProfile } from '@renderer/data/profiles'
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
import { getProducts } from '@renderer/services/profiles'
import {
  createPurchaseOrder,
  createSupplierPayment,
  getProcurementRecords,
  getPurchaseOrders,
  getSuppliers,
  openSupplierInvoice,
  receivePurchaseOrder,
  removePurchaseOrder,
  removeSupplier,
  saveSupplier,
  updatePurchaseOrderStatus,
  uploadSupplierInvoice
} from '@renderer/services/supplierOrders'
import type { PurchaseOrderStatus, Supplier } from '@shared/types'
import { useCallback, useEffect, useState } from 'react'

export interface SupplierOrdersState {
  suppliers: Supplier[]
  orders: PurchaseOrderRecord[]
  products: ItemProfile[]
  deliveries: DeliveryRecord[]
  invoices: InvoiceRecord[]
  payments: PaymentRecord[]
  paymentSummaries: PaymentSummary[]
  isLoading: boolean
  error: string
  refresh: () => Promise<void>
  saveSupplier: (values: SupplierFormValues, id?: number) => Promise<void>
  deleteSupplier: (id: number) => Promise<void>
  createOrder: (values: PurchaseOrderFormValues) => Promise<void>
  updateOrderStatus: (id: number, status: PurchaseOrderStatus) => Promise<void>
  receiveOrder: (id: number, values: DeliveryFormValues) => Promise<void>
  deleteOrder: (id: number) => Promise<void>
  uploadInvoice: (values: InvoiceUploadValues) => Promise<InvoiceRecord | null>
  openInvoice: (id: number) => Promise<void>
  recordPayment: (values: SupplierPaymentValues) => Promise<void>
}

export function useSupplierOrders(): SupplierOrdersState {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([])
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([])
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [paymentSummaries, setPaymentSummaries] = useState<PaymentSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [nextSuppliers, nextOrders, nextProducts, records] = await Promise.all([
        getSuppliers(),
        getPurchaseOrders(),
        getProducts(),
        getProcurementRecords()
      ])
      setSuppliers(nextSuppliers)
      setOrders(nextOrders)
      setProducts(nextProducts)
      setDeliveries(records.deliveries)
      setInvoices(records.invoices)
      setPayments(records.payments)
      setPaymentSummaries(records.paymentSummaries)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load procurement data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all([getSuppliers(), getPurchaseOrders(), getProducts(), getProcurementRecords()])
      .then(([nextSuppliers, nextOrders, nextProducts, records]) => {
        if (cancelled) return
        setSuppliers(nextSuppliers)
        setOrders(nextOrders)
        setProducts(nextProducts)
        setDeliveries(records.deliveries)
        setInvoices(records.invoices)
        setPayments(records.payments)
        setPaymentSummaries(records.paymentSummaries)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load procurement data.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveSupplierRecord = async (values: SupplierFormValues, id?: number): Promise<void> => {
    await saveSupplier(values, id)
    await refresh()
  }

  const deleteSupplierRecord = async (id: number): Promise<void> => {
    await removeSupplier(id)
    await refresh()
  }

  const createOrderRecord = async (values: PurchaseOrderFormValues): Promise<void> => {
    await createPurchaseOrder(values)
    await refresh()
  }

  const updateOrderStatusRecord = async (
    id: number,
    status: PurchaseOrderStatus
  ): Promise<void> => {
    await updatePurchaseOrderStatus(id, status)
    await refresh()
  }

  const receiveOrderRecord = async (id: number, values: DeliveryFormValues): Promise<void> => {
    await receivePurchaseOrder(id, values)
    await refresh()
  }

  const deleteOrderRecord = async (id: number): Promise<void> => {
    await removePurchaseOrder(id)
    await refresh()
  }

  const uploadInvoiceRecord = async (
    values: InvoiceUploadValues
  ): Promise<InvoiceRecord | null> => {
    const invoice = await uploadSupplierInvoice(values)
    if (invoice) await refresh()
    return invoice
  }

  const recordPayment = async (values: SupplierPaymentValues): Promise<void> => {
    await createSupplierPayment(values)
    await refresh()
  }

  return {
    suppliers,
    orders,
    products,
    deliveries,
    invoices,
    payments,
    paymentSummaries,
    isLoading,
    error,
    refresh,
    saveSupplier: saveSupplierRecord,
    deleteSupplier: deleteSupplierRecord,
    createOrder: createOrderRecord,
    updateOrderStatus: updateOrderStatusRecord,
    receiveOrder: receiveOrderRecord,
    deleteOrder: deleteOrderRecord,
    uploadInvoice: uploadInvoiceRecord,
    openInvoice: openSupplierInvoice,
    recordPayment
  }
}
