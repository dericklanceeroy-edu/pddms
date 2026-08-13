import type { Account } from '@libs/db/tables'

export interface GlobalContext {
  session?: {
    account: Account
  }
}

/**
 * Shared global context by all channel controllers.
 */
export let globalContext: GlobalContext = {}
