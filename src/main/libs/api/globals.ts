import type { Account } from '@libs/db/tables'

export interface State {
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

export let state: State = {
  database: {
    stale: false
  }
}
