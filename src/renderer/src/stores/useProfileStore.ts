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
  areItemsLoaded: boolean
  areCustomersLoaded: boolean
  isLoading: boolean
  error: string
  load: (force?: boolean) => Promise<void>
  loadItems: (force?: boolean) => Promise<void>
  loadCustomers: (force?: boolean) => Promise<void>
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
  areItemsLoaded: false,
  areCustomersLoaded: false,
  isLoading: false,
  error: '',
  load: async (force = false) => {
    if (get().isLoading || (get().isLoaded && !force)) return
    set({ isLoading: true, error: '' })
    try {
      const [items, customers] = await Promise.all([getProducts(), getCustomers()])
      set({
        items,
        customers,
        isLoaded: true,
        areItemsLoaded: true,
        areCustomersLoaded: true,
        isLoading: false
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unable to load profile data.'
      })
    }
  },
  loadItems: async (force = false) => {
    if (get().isLoading || (get().areItemsLoaded && !force)) return
    set({ isLoading: true, error: '' })
    try {
      const items = await getProducts()
      set({ items, areItemsLoaded: true, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unable to load inventory data.'
      })
    }
  },
  loadCustomers: async (force = false) => {
    if (get().isLoading || (get().areCustomersLoaded && !force)) return
    set({ isLoading: true, error: '' })
    try {
      const customers = await getCustomers()
      set({ customers, areCustomersLoaded: true, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unable to load customer data.'
      })
    }
  },
  addItem: async (draft) => {
    const item = await addProduct(draft)
    set((state) => ({ items: [item, ...state.items] }))
    return item
  },
  updateItem: async (id, draft) => {
    await updateProduct(id, draft)
    const items = await getProducts()
    set({ items })
    return items.find((item) => item.id === id)!
  },
  removeItem: async (id) => {
    await removeProduct(id)
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },
  saveCustomer: async (draft, id) => {
    const customer = await requestSaveCustomer(draft, id)
    customer.transactions =
      get().customers.find((value) => value.id === customer.id)?.transactions ?? []
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
  reset: () =>
    set({
      items: [],
      customers: [],
      isLoaded: false,
      areItemsLoaded: false,
      areCustomersLoaded: false,
      isLoading: false,
      error: ''
    })
}))
