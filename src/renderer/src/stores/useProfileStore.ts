import {
  initialCustomers,
  initialItems,
  type CustomerProfile,
  type ItemProfile
} from '@renderer/data/profiles'
import { create } from 'zustand'

interface ProfileStore {
  items: ItemProfile[]
  customers: CustomerProfile[]
  addItem: (item: ItemProfile) => void
  removeItem: (id: number) => void
  saveCustomer: (customer: CustomerProfile) => void
  removeCustomer: (id: number) => void
}

export const useProfileStore = create<ProfileStore>((set) => ({
  items: initialItems,
  customers: initialCustomers,
  addItem: (item) => set((state) => ({ items: [item, ...state.items] })),
  removeItem: (id) => set((state) => ({ items: state.items.filter((value) => value.id !== id) })),
  saveCustomer: (customer) =>
    set((state) => ({
      customers: state.customers.some((value) => value.id === customer.id)
        ? state.customers.map((value) => (value.id === customer.id ? customer : value))
        : [customer, ...state.customers]
    })),
  removeCustomer: (id) =>
    set((state) => ({ customers: state.customers.filter((value) => value.id !== id) }))
}))
