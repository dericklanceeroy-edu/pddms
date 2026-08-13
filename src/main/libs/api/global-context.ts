import type { Account } from '@libs/db/tables'

export interface GlobalContext {
  session?: {
    account: Account
  }
}

/**
 * Shared global context by all channels that is passed to their
 * setup functions.
 */
export let globalContext: GlobalContext = {}
