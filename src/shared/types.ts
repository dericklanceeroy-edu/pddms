import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { ValueOf } from 'type-fest'
import { resources, roles } from './constants'

export interface Database {
  accounts: AccountsTable
  batches: BatchesTable
  customers: CustomersTable
  drugs: DrugsTable
  purchaseOrderItems: PurchaseOrderItemsTable
  purchaseOrders: PurchaseOrdersTable
  suppliers: SuppliersTable
}

/**
 * Type of all database ID columns.
 */
export type Id = number

/**
 * Used to represent booleans for SQLite.
 */
export type ZeroOrOne = 0 | 1

export interface AccountsTable {
  id: ColumnType<Id, Id | undefined, never>
  role: Role
  username: string
  fullName: string
  password: string
  isArchived: ColumnType<ZeroOrOne, never, ZeroOrOne>
  isVerified: ColumnType<ZeroOrOne, ZeroOrOne | undefined, ZeroOrOne>
  createdAt: ColumnType<Date, string | undefined, never>
  updatedAt: ColumnType<Date, string | undefined, never>
}

export interface BatchesTable {
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

export interface DrugsTable {
  id: ColumnType<Id, Id | undefined, never>
  category: string
  genericName: string
  brandName: string
  formulation: string
  isPrescribed: ZeroOrOne
  isControlled: ZeroOrOne
  reorderLevel: ColumnType<number, number | undefined, number>
  isArchived: ColumnType<ZeroOrOne, ZeroOrOne | undefined, ZeroOrOne>
}

export interface CustomersTable {
  id: ColumnType<Id, Id | undefined, never>
  fullName: string
  phone: string
  email: string | null
  address: string | null
  discountType: 'none' | 'senior' | 'pwd'
  discountId: string | null
  discountExpiresAt: string | null
  createdAt: ColumnType<string, string | undefined, never>
  updatedAt: ColumnType<string, string | undefined, never>
}

export interface SuppliersTable {
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

export type PurchaseOrderStatus =
  'draft' | 'submitted' | 'partially_received' | 'received' | 'cancelled'

export interface PurchaseOrdersTable {
  id: ColumnType<Id, Id | undefined, never>
  supplierId: Id
  orderNumber: string
  status: PurchaseOrderStatus
  orderedAt: ColumnType<string, string | undefined, never>
  expectedAt: string | null
  receivedAt: string | null
  notes: string | null
  totalAmount: number
  createdBy: Id
  createdAt: ColumnType<string, string | undefined, never>
  updatedAt: ColumnType<string, string | undefined, never>
}

export interface PurchaseOrderItemsTable {
  id: ColumnType<Id, Id | undefined, never>
  purchaseOrderId: Id
  drugId: Id
  quantity: number
  unitCost: number
  receivedQuantity: number
}

export type Account = Selectable<AccountsTable>
export type NewAccount = Insertable<AccountsTable>
export type AccountUpdate = Updateable<AccountsTable>
export type AccountWithoutPassword = Omit<Account, 'password'>

export type Customer = Selectable<CustomersTable>
export type NewCustomer = Insertable<CustomersTable>
export type CustomerUpdate = Updateable<CustomersTable>

export interface Credentials {
  username: Account['username']
  password: Account['password']
}

export type Batch = Selectable<BatchesTable>
export type NewBatch = Insertable<BatchesTable>
export type BatchUpdate = Updateable<BatchesTable>

export type Drug = Selectable<DrugsTable>
export type NewDrug = Insertable<DrugsTable>
export type DrugUpdate = Updateable<DrugsTable>
export type Product = Omit<Drug, 'isPrescribed' | 'isControlled'> & {
  isPrescribed: boolean
  isControlled: boolean
}
export type NewProduct = Omit<NewDrug, 'isPrescribed' | 'isControlled'> & {
  isPrescribed: boolean
  isControlled: boolean
}

export type Supplier = Selectable<SuppliersTable>
export type NewSupplier = Insertable<SuppliersTable>
export type SupplierUpdate = Updateable<SuppliersTable>

export type PurchaseOrder = Selectable<PurchaseOrdersTable>
export type NewPurchaseOrder = Insertable<PurchaseOrdersTable>
export type PurchaseOrderUpdate = Updateable<PurchaseOrdersTable>
export type PurchaseOrderItem = Selectable<PurchaseOrderItemsTable>
export type NewPurchaseOrderItem = Insertable<PurchaseOrderItemsTable>

export interface PurchaseOrderLine extends PurchaseOrderItem {
  productName: string
}

export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplierName: string
  createdByName: string
  items: PurchaseOrderLine[]
}

export type Role = ValueOf<typeof roles>
export type Resource = ValueOf<typeof resources>
