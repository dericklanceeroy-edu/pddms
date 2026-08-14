import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { Id } from '../types'

export const BATCH_TABLE = 'batches'

export interface Batches {
  id: ColumnType<Id, Id | undefined, never>
  drugId: Id
  supplierId: Id
  tag: string
  buyPrice: number
  sellPrice: number
  initialStock: number
  currentStock: number
  manufacturedAt: Date
  expiresAt: Date
}

export type Batch = Selectable<Batches>
export type NewBatch = Insertable<Batches>
export type BatchUpdate = Updateable<Batches>
