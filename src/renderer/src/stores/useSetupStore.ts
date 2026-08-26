import type { NewAccount } from '@shared/types'
import { create, type StateCreator } from 'zustand'

interface MasterAccountSlice {
  masterAccount: NewAccount | null
  updateMasterAccount: (newAccount: NewAccount | null) => void
}

const createMasterAccountSlice: StateCreator<MasterAccountSlice> = (set) => ({
  masterAccount: null,
  updateMasterAccount: (newAccount) => set({ masterAccount: newAccount })
})

interface StaffAccountsSlice {
  staffAccounts: NewAccount[]
  addStaffAccount: (newAccount: NewAccount) => void
  removeStaffAccount: (username: NewAccount['username']) => void
}

const createStaffAccountSlice: StateCreator<StaffAccountsSlice> = (set) => ({
  staffAccounts: [],
  addStaffAccount: (newAccount) =>
    set(({ staffAccounts }) => ({
      staffAccounts: [...staffAccounts, newAccount]
    })),
  removeStaffAccount: (username) =>
    set(({ staffAccounts }) => ({
      staffAccounts: staffAccounts.filter((value) => value.username !== username)
    }))
})

type newStore = MasterAccountSlice & StaffAccountsSlice

export const useSetupStore = create<newStore>((...parameters) => ({
  ...createMasterAccountSlice(...parameters),
  ...createStaffAccountSlice(...parameters)
}))
