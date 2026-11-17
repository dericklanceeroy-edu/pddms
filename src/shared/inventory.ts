export const EXPIRY_WARNING_DAYS = 90
export type ExpiryStatus = 'expired' | 'near-expiry' | 'valid' | 'unknown'

export const localDate = (value = new Date()): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

/** Local date the given number of years from today, used to cap dates typed far in the future. */
export const yearsFromToday = (years: number, today = new Date()): string =>
  localDate(new Date(today.getFullYear() + years, today.getMonth(), today.getDate()))

export function getExpiryStatus(expiresAt: string, now = new Date()): ExpiryStatus {
  const value = expiresAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'unknown'
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return 'unknown'
  const days = (parsed.getTime() - Date.parse(`${localDate(now)}T00:00:00Z`)) / 86_400_000
  if (days < 0) return 'expired'
  return days <= EXPIRY_WARNING_DAYS ? 'near-expiry' : 'valid'
}

export const expiryLabels: Record<ExpiryStatus, string> = {
  expired: 'Expired — not sellable',
  'near-expiry': 'Nearing expiry',
  valid: 'Within date',
  unknown: 'Invalid expiry — not sellable'
}

export const isBatchSellable = (stock: number, expiresAt: string, now = new Date()): boolean =>
  stock > 0 && ['valid', 'near-expiry'].includes(getExpiryStatus(expiresAt, now))

export interface StockOutValues {
  batchId: number
  quantity: number
  reasonCode: import('./types').WriteOffReason
  /** Notes; required when the reason is "Other". */
  reason: string
}

export interface StockOutRecord {
  batchId: number
  quantity: number
  reasonCode: import('./types').WriteOffReason | null
  reason: string
  id: number
  batchNumber: string
  recordedByName: string
  createdAt: string
}

const expiryDateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })
/** Expiry date as shown across the app, e.g. "Jan 9, 2028" (read as a local date, not UTC). */
export const expiryDateLabel = (expiresAt: string): string => {
  const day = String(expiresAt).slice(0, 10)
  const value = new Date(`${day}T00:00:00`)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(value.getTime())
    ? expiryDateFormat.format(value)
    : String(expiresAt)
}
