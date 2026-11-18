import { isBatchSellable } from '@shared/inventory'

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'
export type CustomerDiscount = 'none' | 'senior' | 'pwd'

export interface ItemBatch {
  id: number
  batchNumber: string
  supplier: string
  stock: number
  /** Pieces promised to undelivered wholesale orders; on hand but not free to sell. */
  reserved: number
  /** Selling price of one piece. */
  sellPrice: number
  /** Selling price of one box; null means piece price × pieces per box. */
  boxSellPrice: number | null
  /** Price of one box for pharmacy clients; null means the retail box price. */
  wholesaleBoxPrice: number | null
  /** Pieces in one box of this batch, as delivered; 1 means it is handled by the piece only. */
  piecesPerBox: number
  expiresAt: string
  receipts: Array<{ orderNumber: string; deliveredAt: string; quantity: number }>
}

export interface ItemProfile {
  id: number
  genericName: string
  brandName: string
  category: string
  formulation: string
  prescriptionRequired: boolean
  controlled: boolean
  reorderLevel: number
  genericEquivalentIds: number[]
  batches: ItemBatch[]
}

export interface CustomerTransaction {
  id: string
  purchasedAt: string
  itemCount: number
  total: number
  /** A voided sale stays in the history with a total of 0. */
  voided?: boolean
}

export type ClientType = 'retail' | 'pharmacy'

export interface CustomerProfile {
  id: number
  /** Retail customer, or a pharmacy that buys wholesale. */
  clientType: ClientType
  /** Pharmacy name for pharmacy clients. */
  fullName: string
  contactPerson: string
  phone: string
  email: string
  address: string
  /** Tax identification number, for pharmacy clients. */
  tin: string
  discountType: CustomerDiscount
  discountId: string
  discountExpiresAt: string | null
  transactions: CustomerTransaction[]
  createdAt: string
}

export type CustomerDraft = Omit<CustomerProfile, 'id' | 'transactions' | 'createdAt'>
export type ItemDraft = Omit<ItemProfile, 'id' | 'genericEquivalentIds' | 'batches'>

export const getItemStock = (item: ItemProfile): number =>
  item.batches.reduce((total, batch) => total + batch.stock, 0)

export const getSellableStock = (item: ItemProfile): number =>
  item.batches
    .filter((batch) => isBatchSellable(batch.stock, batch.expiresAt))
    .reduce((total, batch) => total + batch.stock, 0)

export const getStockStatus = (item: ItemProfile): StockStatus => {
  const stock = getSellableStock(item)
  if (stock === 0) return 'out-of-stock'
  return stock <= item.reorderLevel ? 'low-stock' : 'in-stock'
}

/** Box sizes of the batches in stock, smallest first, e.g. [50, 100]; empty when sold by the piece. */
export const boxSizes = (item: ItemProfile): number[] =>
  [...new Set(item.batches.filter((batch) => batch.stock > 0 && batch.piecesPerBox > 1).map((batch) => batch.piecesPerBox))].sort(
    (a, b) => a - b
  )
