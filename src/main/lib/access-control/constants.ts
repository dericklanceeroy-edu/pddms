import type { ValueOf } from "type-fest"

export const roles = {
  admin: 'admin',
  staff: 'staff'
} as const

export type RoleLiterals = ValueOf<typeof roles>

export const resources = {
  user: 'user'
} as const

export type ResourceLiterals = ValueOf<typeof resources>
