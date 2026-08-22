import type { Accounts, Batches, Drugs, Suppliers } from '@libs/db/tables'
import type { Insertable, Selectable, Updateable } from 'kysely'

export type Account = Selectable<Accounts>
export type NewAccount = Insertable<Accounts>
export type AccountUpdate = Updateable<Accounts>
export type AccountWithoutPassword = Omit<Account, 'password'>

export type Batch = Selectable<Batches>
export type NewBatch = Insertable<Batches>
export type BatchUpdate = Updateable<Batches>

export type Drug = Selectable<Drugs>
export type NewDrug = Insertable<Drugs>
export type DrugUpdate = Updateable<Drugs>

export type Supplier = Selectable<Suppliers>
export type NewSupplier = Insertable<Suppliers>
export type SupplierUpdate = Updateable<Suppliers>
