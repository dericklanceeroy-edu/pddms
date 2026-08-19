import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
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

export type Batch = Selectable<Batches>
export type NewBatch = Insertable<Batches>
export type BatchUpdate = Updateable<Batches>
