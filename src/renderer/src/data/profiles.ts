import { isBatchSellable } from '@shared/inventory'

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'
export type CustomerDiscount = 'none' | 'senior' | 'pwd'

export interface ItemBatch {
  id: number
  batchNumber: string
  supplier: string
  stock: number
  /** Selling price of one piece. */
  sellPrice: number
  /** Selling price of one box; null means piece price × pieces per box. */
  boxSellPrice: number | null
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
  /** Pieces in one box; 1 means the product is handled by the piece only. */
  piecesPerBox: number
  genericEquivalentIds: number[]
  batches: ItemBatch[]
}

export interface CustomerTransaction {
  id: string
  purchasedAt: string
  itemCount: number
  total: number
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
