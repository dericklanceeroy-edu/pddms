import type { Account, AccountWithoutPassword } from './types'

export const LOGIN_MAX_ATTEMPTS = 5
export const LOGIN_WINDOW_MS = 5 * 60 * 1000
export const LOGIN_LOCK_MS = 60 * 1000
export const isLocked = (account: Pick<Account, 'lockedUntil'>): boolean =>
  !!account.lockedUntil && Date.parse(account.lockedUntil) > Date.now()
export function publicAccount(account: Account): AccountWithoutPassword {
  const { password, failedAttempts, lastFailedAt, lockedUntil, ...visible } = account
  void password
  void failedAttempts
  void lastFailedAt
  void lockedUntil
  return visible
}
export interface AuditRecord {
  id: number
  eventId: string
  actorId: number | null
  actorName: string
  action: string
  resource: string
  targetId: number | null
  result: string
  createdAt: string
  /** JSON of {@link AuditDetails}; NULL for entries without recorded values. */
  details: string | null
}
export type AuditValue = string | number | boolean | null
export interface AuditChange {
  field: string
  from: AuditValue
  to: AuditValue
}
/** What a change did: a short summary, the reason given, and each field's old and new value. */
export interface AuditDetails {
  summary?: string
  reason?: string
  changes?: AuditChange[]
}
/** Field-by-field differences between two records, using readable labels. */
export function auditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>
): AuditChange[] {
  const value = (input: unknown): AuditValue =>
    input === undefined || input === null
      ? null
      : typeof input === 'number' || typeof input === 'boolean'
        ? input
        : String(input)
  return Object.entries(labels)
    .filter(([key]) => key in after && value(before[key]) !== value(after[key]))
    .map(([key, field]) => ({ field, from: value(before[key]), to: value(after[key]) }))
}
export interface BackupInfo {
  directory: string
  createdAt: string
  invoiceCount: number
  /** Invoices whose stored file was missing when the backup was made, e.g. "INV-001 (Supplier)". */
  missingInvoices?: string[]
}
