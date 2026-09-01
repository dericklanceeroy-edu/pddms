import type { ItemProfile } from '@renderer/data/profiles'
import type {
  PurchaseOrderFormValues,
  PurchaseOrderRecord,
  SupplierFormValues
} from '@renderer/data/supplierOrders'
import { getProducts } from '@renderer/services/profiles'
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getSuppliers,
  receivePurchaseOrder,
  removePurchaseOrder,
  removeSupplier,
  saveSupplier,
  updatePurchaseOrderStatus
} from '@renderer/services/supplierOrders'
import type { PurchaseOrderStatus, Supplier } from '@shared/types'
import { useCallback, useEffect, useState } from 'react'

interface SupplierOrdersState {
  suppliers: Supplier[]
  orders: PurchaseOrderRecord[]
  products: ItemProfile[]
  isLoading: boolean
  error: string
  refresh: () => Promise<void>
  saveSupplier: (values: SupplierFormValues, id?: number) => Promise<void>
  deleteSupplier: (id: number) => Promise<void>
  createOrder: (values: PurchaseOrderFormValues) => Promise<void>
  updateOrderStatus: (id: number, status: PurchaseOrderStatus) => Promise<void>
  receiveOrder: (
    id: number,
    items: Array<{ itemId: number; receivedQuantity: number }>
  ) => Promise<void>
  deleteOrder: (id: number) => Promise<void>
}

export function useSupplierOrders(): SupplierOrdersState {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([])
  const [products, setProducts] = useState<ItemProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [nextSuppliers, nextOrders, nextProducts] = await Promise.all([
        getSuppliers(),
        getPurchaseOrders(),
        getProducts()
      ])
      setSuppliers(nextSuppliers)
      setOrders(nextOrders)
      setProducts(nextProducts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load procurement data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all([getSuppliers(), getPurchaseOrders(), getProducts()])
      .then(([nextSuppliers, nextOrders, nextProducts]) => {
        if (cancelled) return
        setSuppliers(nextSuppliers)
        setOrders(nextOrders)
        setProducts(nextProducts)
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

  const receiveOrderRecord = async (
    id: number,
    items: Array<{ itemId: number; receivedQuantity: number }>
  ): Promise<void> => {
    await receivePurchaseOrder(id, items)
    await refresh()
  }

  const deleteOrderRecord = async (id: number): Promise<void> => {
    await removePurchaseOrder(id)
    await refresh()
  }

  return {
    suppliers,
    orders,
    products,
    isLoading,
    error,
    refresh,
    saveSupplier: saveSupplierRecord,
    deleteSupplier: deleteSupplierRecord,
    createOrder: createOrderRecord,
    updateOrderStatus: updateOrderStatusRecord,
    receiveOrder: receiveOrderRecord,
    deleteOrder: deleteOrderRecord
  }
}
