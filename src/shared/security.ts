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
}
export interface BackupInfo {
  directory: string
  createdAt: string
  invoiceCount: number
}
