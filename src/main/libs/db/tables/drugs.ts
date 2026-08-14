import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { Id } from '..'

export const DRUG_TABLE = 'drugs'

export interface Drugs {
  id: ColumnType<Id, Id | undefined, never>
  supplierId: Id
  genericName: string
  brandName: string
  description: string
  cost: number
  stock: number
  category: string
  expiresAt: Date
}

export type Drug = Selectable<Drugs>
export type NewDrug = Insertable<Drugs>
export type DrugUpdate = Updateable<Drugs>
