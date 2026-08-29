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
  updateItem: (item: ItemProfile) => void
  saveCustomer: (customer: CustomerProfile) => void
}

export const useProfileStore = create<ProfileStore>((set) => ({
  items: initialItems,
  customers: initialCustomers,
  updateItem: (item) =>
    set((state) => ({ items: state.items.map((value) => (value.id === item.id ? item : value)) })),
  saveCustomer: (customer) =>
    set((state) => ({
      customers: state.customers.some((value) => value.id === customer.id)
        ? state.customers.map((value) => (value.id === customer.id ? customer : value))
        : [customer, ...state.customers]
    }))
}))
