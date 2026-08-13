import { roles, type Role } from './constants'

export function isRole(value: unknown): value is Role {
  return Object.values(roles).includes(value as Role)
}
