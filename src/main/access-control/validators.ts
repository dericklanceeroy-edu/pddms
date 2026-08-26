import { roles } from '@shared/constants'
import type { Role } from '@shared/types'

export function isRole(value: unknown): value is Role {
  return Object.values(roles).includes(value as Role)
}
