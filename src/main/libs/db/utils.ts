import type { Id } from '.'

/**
 * Checks if the value is of `Id` type.
 */
export function isId(value: unknown): value is Id {
  return typeof value === 'number'
}
