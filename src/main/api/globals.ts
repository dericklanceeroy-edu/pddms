import type { AuditDetails } from '@shared/security'
import type { Account } from '@shared/types'

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
  /** Set when a permission check refused the current request, so it is logged as "denied". */
  denied?: boolean
  /** What changed in the current request (old → new values, reason), saved on its audit entry. */
  auditDetails?: AuditDetails
}

export const state: State = {
  database: {
    stale: false
  }
}
