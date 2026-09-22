export const EXPIRY_WARNING_DAYS = 90
export type ExpiryStatus = 'expired' | 'near-expiry' | 'valid' | 'unknown'

export const localDate = (value = new Date()): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

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
  reason: string
}

export interface StockOutRecord extends StockOutValues {
  id: number
  batchNumber: string
  recordedByName: string
  createdAt: string
}
