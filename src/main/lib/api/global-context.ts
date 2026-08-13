import type { Role } from '@lib/access-control'
import type { Account } from '@lib/db/tables'

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
