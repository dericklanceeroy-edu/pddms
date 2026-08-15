import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { Id } from '../types'

export const SUPPLIER_TABLE = 'suppliers'

export interface Suppliers {
  id: ColumnType<Id, Id | undefined, never>
  organization: string
  contactPerson: string
  phoneNumber: string
  telephoneNumber: string | null
  emailAddress: string | null
  street: string
  city: string
  country: string
  province: string
  postalCode: string
}

export type Supplier = Selectable<Suppliers>
export type NewSupplier = Insertable<Suppliers>
export type SupplierUpdate = Updateable<Suppliers>
