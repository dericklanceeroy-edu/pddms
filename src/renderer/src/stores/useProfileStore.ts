import type {
  CustomerDraft,
  CustomerProfile,
  ItemDraft,
  ItemProfile
} from '@renderer/data/profiles'
import {
  addProduct,
  getCustomers,
  getProducts,
  removeProduct,
  removeCustomer as requestRemoveCustomer,
  saveCustomer as requestSaveCustomer,
  updateProduct
} from '@renderer/services/profiles'
import { create } from 'zustand'

interface ProfileStore {
  items: ItemProfile[]
  customers: CustomerProfile[]
  isLoaded: boolean
  isLoading: boolean
  error: string
  load: () => Promise<void>
  addItem: (item: ItemDraft) => Promise<ItemProfile>
  updateItem: (id: number, item: ItemDraft) => Promise<ItemProfile>
  removeItem: (id: number) => Promise<void>
  saveCustomer: (customer: CustomerDraft, id?: number) => Promise<CustomerProfile>
  removeCustomer: (id: number) => Promise<void>
  reset: () => void
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  items: [],
  customers: [],
  isLoaded: false,
  isLoading: false,
  error: '',
  load: async () => {
    if (get().isLoading || get().isLoaded) return
    set({ isLoading: true, error: '' })
    try {
      const [items, customers] = await Promise.all([getProducts(), getCustomers()])
      set({ items, customers, isLoaded: true, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unable to load profile data.'
      })
    }
  },
  addItem: async (draft) => {
    const item = await addProduct(draft)
    set((state) => ({ items: [item, ...state.items] }))
    return item
  },
  updateItem: async (id, draft) => {
    const item = await updateProduct(id, draft)
    const currentItem = get().items.find((value) => value.id === id)
    const updatedItem = { ...item, batches: currentItem?.batches ?? [] }
    set((state) => ({
      items: state.items.map((value) => (value.id === id ? updatedItem : value))
    }))
    return updatedItem
  },
  removeItem: async (id) => {
    await removeProduct(id)
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },
  saveCustomer: async (draft, id) => {
    const customer = await requestSaveCustomer(draft, id)
    set((state) => ({
      customers: state.customers.some((value) => value.id === customer.id)
        ? state.customers.map((value) => (value.id === customer.id ? customer : value))
        : [customer, ...state.customers]
    }))
    return customer
  },
  removeCustomer: async (id) => {
    await requestRemoveCustomer(id)
    set((state) => ({ customers: state.customers.filter((value) => value.id !== id) }))
  },
  reset: () => set({ items: [], customers: [], isLoaded: false, isLoading: false, error: '' })
}))
