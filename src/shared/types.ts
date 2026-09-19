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
  supplierDeliveries: SupplierDeliveriesTable
  supplierDeliveryItems: SupplierDeliveryItemsTable
  supplierInvoices: SupplierInvoicesTable
  supplierPayments: SupplierPaymentsTable
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
  expiresAt: ColumnType<Date, string, string>
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

export interface SupplierDeliveriesTable {
  id: ColumnType<Id, Id | undefined, never>
  purchaseOrderId: Id
  supplierId: Id
  deliveredAt: string
  notes: string | null
  recordedBy: Id
  createdAt: ColumnType<string, string | undefined, never>
}

export interface SupplierDeliveryItemsTable {
  id: ColumnType<Id, Id | undefined, never>
  deliveryId: Id
  purchaseOrderItemId: Id
  drugId: Id
  batchId: Id
  quantity: number
}

export type SupplierInvoiceStatus = 'unpaid' | 'partially_paid' | 'paid'

export interface SupplierInvoicesTable {
  id: ColumnType<Id, Id | undefined, never>
  supplierId: Id
  purchaseOrderId: Id
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  amount: number
  status: SupplierInvoiceStatus
  originalFilename: string
  storedFilename: string
  mimeType: string
  fileSize: number
  uploadedBy: Id
  createdAt: ColumnType<string, string | undefined, never>
}

export interface SupplierPaymentsTable {
  id: ColumnType<Id, Id | undefined, never>
  supplierId: Id
  purchaseOrderId: Id
  invoiceId: Id | null
  amount: number
  paidAt: string
  method: string
  referenceNumber: string | null
  notes: string | null
  recordedBy: Id
  createdAt: ColumnType<string, string | undefined, never>
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
export interface ProductUpdate {
  category?: string
  genericName?: string
  brandName?: string
  formulation?: string
  isPrescribed?: boolean
  isControlled?: boolean
  reorderLevel?: number
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

export type SupplierDelivery = Selectable<SupplierDeliveriesTable>
export type SupplierInvoice = Selectable<SupplierInvoicesTable>
export type SupplierPayment = Selectable<SupplierPaymentsTable>

export interface SupplierDeliveryWithDetails extends SupplierDelivery {
  orderNumber: string
  supplierName: string
  recordedByName: string
  items: Array<{
    id: Id
    productName: string
    batchNumber: string
    quantity: number
  }>
}

export interface SupplierInvoiceWithDetails extends SupplierInvoice {
  orderNumber: string
  supplierName: string
  uploadedByName: string
  paidAmount: number
  outstandingAmount: number
  deadlineStatus: 'overdue' | 'due_soon' | 'upcoming' | 'paid'
}

export interface SupplierPaymentWithDetails extends SupplierPayment {
  invoiceNumber: string | null
  orderNumber: string
  supplierName: string
  recordedByName: string
}

export interface PurchaseOrderPaymentSummary {
  purchaseOrderId: Id
  supplierId: Id
  orderNumber: string
  supplierName: string
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  status: SupplierInvoiceStatus
}

export type Role = ValueOf<typeof roles>
export type Resource = ValueOf<typeof resources>
