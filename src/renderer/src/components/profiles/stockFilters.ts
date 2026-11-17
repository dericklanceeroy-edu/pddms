import { getItemStock, getStockStatus, type ItemProfile } from '@renderer/data/profiles'
import { getExpiryStatus } from '@shared/inventory'

export type StockFilter =
  'all' | 'attention' | 'low-stock' | 'out-of-stock' | 'near-expiry' | 'expired'

export const stockFilters: Array<{ id: StockFilter; label: string }> = [
  { id: 'all', label: 'All Products' },
  { id: 'attention', label: 'Needs Attention' },
  { id: 'low-stock', label: 'Low Stock' },
  { id: 'out-of-stock', label: 'Out of Stock' },
  { id: 'near-expiry', label: 'Expiring Soon' },
  { id: 'expired', label: 'Expired Stock on Hand' }
]

export function matchesFilter(item: ItemProfile, filter: StockFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'attention') return getStockStatus(item) !== 'in-stock'
  if (filter === 'low-stock' || filter === 'out-of-stock') return getStockStatus(item) === filter
  return item.batches.some(
    (batch) => batch.stock > 0 && getExpiryStatus(batch.expiresAt) === filter
  )
}

/** Brand, generic name, category and formulation all match every typed word. */
export const matchesSearch = (item: ItemProfile, query: string): boolean => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const text =
    `${item.genericName} ${item.brandName} ${item.category} ${item.formulation}`.toLowerCase()
  return terms.every((term) => text.includes(term))
}

const statusLabels = {
  'in-stock': 'In Stock',
  'low-stock': 'Low Stock',
  'out-of-stock': 'Out of Stock'
}

/** Stock badge text. Stock that is on hand but all expired reads "Expired", not "Out of Stock". */
export const stockLabel = (item: ItemProfile): string => {
  const status = getStockStatus(item)
  return status === 'out-of-stock' && getItemStock(item) > 0 ? 'Expired' : statusLabels[status]
}
