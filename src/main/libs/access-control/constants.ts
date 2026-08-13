import type { ValueOf } from "type-fest"

export const roles = {
  admin: 'admin',
  cashier: 'cashier'
} as const

export type Role = ValueOf<typeof roles>

export const resources = {
  account: 'account'
} as const

export type Resource = ValueOf<typeof resources>
