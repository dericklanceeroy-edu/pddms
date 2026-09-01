import type { AccountWithoutPassword, Role } from '@shared/types'

export type UserRole = Role
export type UserStatus = 'active' | 'blocked'

export interface ManagedUser {
  id: number
  fullName: string
  username: string
  role: UserRole
  status: UserStatus
  verified: boolean
  createdAt: string
}

export interface UserFormValues {
  fullName: string
  username: string
  role: UserRole
  password: string
}

export const roleLabels: Record<UserRole, string> = {
  master: 'Master',
  staff: 'Staff',
  cashier: 'Cashier'
}

export const mapAccount = (account: AccountWithoutPassword): ManagedUser => ({
  id: account.id,
  fullName: account.fullName,
  username: account.username,
  role: account.role,
  status: account.isArchived === 1 ? 'blocked' : 'active',
  verified: account.isVerified === 1,
  createdAt: String(account.createdAt)
})
