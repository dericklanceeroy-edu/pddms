import type { Role } from '@libs/access-control'
import type { Account } from '@libs/db/tables'

/**
 * Shared global singleton context by all handlers that is passed to
 * their setup functions.
 */
export interface GlobalSingletonContext {
  session?: {
    role: Role
    account: Account
  }
}
