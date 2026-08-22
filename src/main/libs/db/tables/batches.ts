import type { ColumnType } from 'kysely'
import type { Id } from '..'

export const BATCH_TABLE = 'batches'

export interface Batches {
  id: ColumnType<Id, Id | undefined, never>
  drugId: Id
  supplierId: Id
  physicalTag: string | null
  buyPrice: number
  sellPrice: number
  initialStock: number
  currentStock: number
  expiresAt: Date
}
