import type { AccountWithoutPassword, ManagedAccount, Role } from '@shared/types'

export type UserRole = Role
export type UserStatus = 'active' | 'blocked' | 'locked'

export interface ManagedUser {
  id: number
  fullName: string
  username: string
  role: UserRole
  status: UserStatus
  verified: boolean
  createdAt: string
  lockedUntil: string | null
  failedAttempts: number
}

export interface UserFormValues {
  fullName: string
  username: string
  role: UserRole
  password: string
}

export interface UserUpdateValues {
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

export const mapAccount = (
  account: AccountWithoutPassword & Partial<Pick<ManagedAccount, 'lockedUntil' | 'failedAttempts'>>
): ManagedUser => ({
  id: account.id,
  fullName: account.fullName,
  username: account.username,
  role: account.role,
  status:
    account.isArchived === 1
      ? 'blocked'
      : account.lockedUntil && Date.parse(account.lockedUntil) > Date.now()
        ? 'locked'
        : 'active',
  lockedUntil: account.lockedUntil ?? null,
  failedAttempts: account.failedAttempts ?? 0,
  verified: account.isVerified === 1,
  createdAt: String(account.createdAt)
})
