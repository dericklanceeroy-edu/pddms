import type { ColumnType } from 'kysely'
import type { Id } from '../types'

export const SUPPLIER_TABLE = 'suppliers'

export interface Suppliers {
  id: ColumnType<Id, Id | undefined, never>
  organization: string
  person: string
  phone: string
  telephone: string | null
  email: string | null
  street: string
  city: string
  country: string
  province: string
  postalCode: string
}
