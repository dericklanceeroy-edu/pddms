import type { ValueOf } from "type-fest"

export const roles = {
  admin: 'admin',
  staff: 'staff'
} as const

export type Role = ValueOf<typeof roles>

export const resources = {
  account: 'account'
} as const

export type Resource = ValueOf<typeof resources>
