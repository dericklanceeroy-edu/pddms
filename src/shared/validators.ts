import { Id } from './types'

/**
 * Checks if the value is of database `Id` type.
 */
export function isId(value: unknown): value is Id {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}
