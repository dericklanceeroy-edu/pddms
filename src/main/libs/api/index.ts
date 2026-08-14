import type { Account } from '@libs/db/tables'

export interface GlobalContext {
  database: {
    /**
     * Whether the database has been modified.
     */
    modified: boolean
  }
  session?: {
    account: Account
  }
}

/**
 * Shared global context by all channel controllers.
 */
export let globalContext: GlobalContext = {
  database: {
    modified: false
  }
}

export * from './errors'
export * from './guards'
