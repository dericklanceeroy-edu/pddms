import type { Account } from '@libs/db/tables'

export interface GlobalContext {
  database: {
    /**
     * Whether the database has been modified and is ready for backup.
     */
    stale: boolean
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
    stale: false
  }
}

export * from './errors'
export * from './guards'
