import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { ValueOf } from 'type-fest'
import { resources, roles } from './constants'
import type { SaleLine, SaleRecord } from './sales'
import type { StockUnit } from './units'
import type { WholesaleOrder, WholesalePayment } from './wholesale'

export interface Database {
  auditLogs: Omit<import('./security').AuditRecord, 'id'> & {
    id: ColumnType<number, number | undefined, never>
  }
  wholesaleOrders: Omit<WholesaleOrder, 'id'> & {
    id: ColumnType<number, number | undefined, never>
  }
  wholesaleOrderItems: SaleLine & {
    id: ColumnType<number, number | undefined, never>
    orderId: number
  }
  wholesalePayments: Omit<WholesalePayment, 'id'> & {
    id: ColumnType<number, number | undefined, never>
  }
  sales: Omit<SaleRecord, 'id' | 'items'> & { id: ColumnType<number, number | undefined, never> }
  saleItems: SaleLine & { id: ColumnType<number, number | undefined, never>; saleId: number }
  stockOuts: StockOutsTable
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
  supplierProductCosts: SupplierProductCostsTable
  supplierPacks: SupplierPacksTable
  supplierPackPrices: SupplierPackPricesTable
  supplierDeliveryRejections: SupplierDeliveryRejectionsTable
  supplierReturns: SupplierReturnsTable
  supplierCreditNotes: SupplierCreditNotesTable
  stockCounts: StockCountsTable
  stockCountLines: StockCountLinesTable
  stockAdjustments: StockAdjustmentsTable
  cashCounts: CashCountsTable
}

type Generated<T> = ColumnType<T, T | undefined, never>

/** A pack a supplier sells: one product in boxes of a fixed size. Prices live in their own table. */
export interface SupplierPacksTable {
  id: Generated<Id>
  supplierId: Id
  drugId: Id
  piecesPerBox: number
  isArchived: ColumnType<ZeroOrOne, ZeroOrOne | undefined, ZeroOrOne>
  createdAt: Generated<string>
}

/** Agreed cost per box from a supplier quotation; the latest one in effect on a date applies. */
export interface SupplierPackPricesTable {
  id: Generated<Id>
  packId: Id
  unitCost: number
  effectiveFrom: string
  quotationReference: string | null
  recordedBy: Id | null
  createdAt: Generated<string>
}

export interface SupplierDeliveryRejectionsTable {
  id: Generated<Id>
  deliveryId: Id
  purchaseOrderItemId: Id
  drugId: Id
  quantity: number
  reason: string
}

export const supplierReturnReasons = {
  near_expiry: 'Near expiry',
  expired: 'Expired',
  damaged: 'Damaged',
  wrong_item: 'Wrong item delivered',
  recalled: 'Recalled',
  other: 'Other'
} as const
export type SupplierReturnReason = keyof typeof supplierReturnReasons

export interface SupplierReturnsTable {
  id: Generated<Id>
  supplierId: Id
  batchId: Id
  stockOutId: Id
  quantity: number
  reasonCode: SupplierReturnReason
  notes: string | null
  returnedAt: string
  creditNoteId: ColumnType<Id | null, Id | null | undefined, Id | null>
  recordedBy: Id
  createdAt: Generated<string>
}

export interface SupplierCreditNotesTable {
  id: Generated<Id>
  supplierId: Id
  creditNoteNumber: string
  issuedAt: string
  amount: number
  purchaseOrderId: ColumnType<Id | null, Id | null | undefined, Id | null>
  appliedAt: ColumnType<string | null, string | null | undefined, string | null>
  notes: string | null
  recordedBy: Id
  createdAt: Generated<string>
}

export interface StockCountsTable {
  id: Generated<Id>
  status: ColumnType<'open' | 'completed' | 'cancelled', 'open' | undefined, 'completed' | 'cancelled'>
  drugId: Id | null
  notes: string | null
  startedBy: Id
  startedAt: string
  closedBy: ColumnType<Id | null, Id | null | undefined, Id | null>
  closedAt: ColumnType<string | null, string | null | undefined, string | null>
}

export interface StockCountLinesTable {
  id: Generated<Id>
  countId: Id
  batchId: Id
  expected: number
  counted: ColumnType<number | null, number | null | undefined, number | null>
  reason: ColumnType<string | null, string | null | undefined, string | null>
  /** System stock when the count was entered; null on lines saved before this was kept. */
  stockAtCount: ColumnType<number | null, number | null | undefined, number | null>
}

export interface StockAdjustmentsTable {
  id: Generated<Id>
  batchId: Id
  change: number
  reason: string
  countId: Id | null
  recordedBy: Id
  createdAt: string
}

export interface CashCountsTable {
  id: Generated<Id>
  cashierId: Id
  cashierName: string
  businessDate: string
  openingFloatCents: number
  cashSalesCents: number
  cashSalesCount: number
  expectedCents: number
  countedCents: number
  differenceCents: number
  /** JSON object of peso denomination → pieces counted. */
  denominations: string
  notes: string | null
  countedByName: string
  createdAt: string
  /** The earlier count of the same cashier and day that this recount replaces. */
  recountOf: ColumnType<number | null, number | null | undefined, number | null>
}

/** Last agreed cost per box for a supplier and product; prefilled on new orders. */
export interface SupplierProductCostsTable {
  supplierId: Id
  drugId: Id
  unitCost: number
  updatedAt: ColumnType<string, string | undefined, string>
}

export const writeOffReasons = {
  expired: 'Expired',
  damaged: 'Damaged or broken',
  lost: 'Lost or missing',
  recalled: 'Recalled by FDA or manufacturer',
  other: 'Other'
} as const
export type WriteOffReason = keyof typeof writeOffReasons
export type StockOutKind = 'sale' | 'wholesale' | 'write_off' | 'supplier_return'

export interface StockOutsTable {
  id: ColumnType<number, number | undefined, never>
  batchId: number
  quantity: number
  /** Notes: the sale or order reference, or what happened for a write-off. */
  reason: string
  kind: ColumnType<StockOutKind, StockOutKind | undefined, never>
  reasonCode: ColumnType<WriteOffReason | null, WriteOffReason | null | undefined, never>
  recordedBy: number
  createdAt: ColumnType<string, string | undefined, never>
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
  failedAttempts: ColumnType<number, number | undefined, number>
  lastFailedAt: ColumnType<string | null, string | undefined | null, string | null>
  lockedUntil: ColumnType<string | null, string | undefined | null, string | null>
  id: ColumnType<Id, Id | undefined, never>
  role: Role
  username: string
  fullName: string
  /** Contact email; accounts created before emails were collected have none. */
  email: ColumnType<string | null, string | null | undefined, string | null>
  /** Mobile number (09XXXXXXXXX); optional for accounts created before it was collected. */
  phone: ColumnType<string | null, string | null | undefined, string | null>
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
  /** Selling price of one box; NULL means piece price × pieces per box. */
  boxSellPrice: ColumnType<number | null, number | null | undefined, number | null>
  /** Wholesale price of one box; NULL means the retail box price is used. */
  wholesaleBoxPrice: ColumnType<number | null, number | null | undefined, number | null>
  /** Pieces in one box of this batch, as it arrived from the supplier. */
  piecesPerBox: ColumnType<number, number | undefined, never>
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
  piecesPerBox: ColumnType<number, number | undefined, number>
  isArchived: ColumnType<ZeroOrOne, ZeroOrOne | undefined, ZeroOrOne>
}

export interface CustomersTable {
  id: ColumnType<Id, Id | undefined, never>
  /** `retail` buys at the counter; `pharmacy` is another pharmacy that orders wholesale. */
  clientType: ColumnType<
    'retail' | 'pharmacy',
    'retail' | 'pharmacy' | undefined,
    'retail' | 'pharmacy'
  >
  /** Pharmacy name for pharmacy clients, the customer's own name otherwise. */
  fullName: string
  /** Person to talk to at a pharmacy client. */
  contactPerson: ColumnType<string | null, string | null | undefined, string | null>
  phone: string
  email: string | null
  address: string | null
  discountType: 'none' | 'senior' | 'pwd'
  discountId: string | null
  discountExpiresAt: string | null
  /** Pharmacy client's tax identification number. */
  tin: ColumnType<string | null, string | null | undefined, string | null>
  isArchived: ColumnType<ZeroOrOne, ZeroOrOne | undefined, ZeroOrOne>
  /** Set when this record was merged into another one; it stays archived. */
  mergedInto: ColumnType<Id | null, Id | null | undefined, Id | null>
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
  /** PDEA license or local permit number, for the dangerous drugs register. */
  pdeaLicense: ColumnType<string | null, string | null | undefined, string | null>
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
  submittedBy: ColumnType<Id | null, Id | null | undefined, Id | null>
  submittedAt: ColumnType<string | null, string | null | undefined, string | null>
  cancelledBy: ColumnType<Id | null, Id | null | undefined, Id | null>
  cancelledAt: ColumnType<string | null, string | null | undefined, string | null>
}

/** Quantities and unit cost are per order unit; one unit holds `piecesPerUnit` pieces. */
export interface PurchaseOrderItemsTable {
  id: ColumnType<Id, Id | undefined, never>
  purchaseOrderId: Id
  drugId: Id
  quantity: number
  unitCost: number
  receivedQuantity: number
  unit: ColumnType<StockUnit, StockUnit | undefined, StockUnit>
  piecesPerUnit: ColumnType<number, number | undefined, number>
  /** Supplier pack the line was ordered from; NULL for lines saved before the price list. */
  packId: ColumnType<Id | null, Id | null | undefined, Id | null>
}

export interface SupplierDeliveriesTable {
  id: ColumnType<Id, Id | undefined, never>
  requestId: ColumnType<string | null, string | null | undefined, never>
  requestFingerprint: ColumnType<string | null, string | null | undefined, never>
  purchaseOrderId: Id
  supplierId: Id
  deliveredAt: string
  notes: string | null
  recordedBy: Id
  createdAt: ColumnType<string, string | undefined, never>
  /** The supplier's person who brought the goods. */
  deliveredByName: ColumnType<string | null, string | null | undefined, never>
  /** The staff member who checked the goods against the order. */
  checkedByName: ColumnType<string | null, string | null | undefined, never>
}

export interface SupplierDeliveryItemsTable {
  id: ColumnType<Id, Id | undefined, never>
  deliveryId: Id
  purchaseOrderItemId: Id
  drugId: Id
  batchId: Id
  quantity: number
  /** Cost per box on the supplier's invoice for this delivery. */
  unitCost: number
  /** Pieces per box that actually arrived. */
  piecesPerUnit: number
  /** Why the invoice cost or box size differs from the order. */
  differenceReason: string | null
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
export type AccountWithoutPassword = Omit<
  Account,
  'password' | 'failedAttempts' | 'lastFailedAt' | 'lockedUntil'
>
export type ManagedAccount = AccountWithoutPassword & {
  failedAttempts: number
  lockedUntil: string | null
}

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
  submittedByName: string | null
  cancelledByName: string | null
  items: PurchaseOrderLine[]
}

export type SupplierDelivery = Selectable<SupplierDeliveriesTable>
export type SupplierInvoice = Selectable<SupplierInvoicesTable>
export type SupplierPayment = Selectable<SupplierPaymentsTable>

export interface SupplierDeliveryWithDetails extends Omit<
  SupplierDelivery,
  'requestId' | 'requestFingerprint'
> {
  orderNumber: string
  supplierName: string
  recordedByName: string
  items: Array<{
    id: Id
    productName: string
    batchNumber: string
    quantity: number
    orderedQuantity: number
    unit: StockUnit
    piecesPerUnit: number
    orderedPiecesPerUnit: number
    unitCost: number
    orderedUnitCost: number
    differenceReason: string | null
    expiresAt: string
  }>
  rejections: Array<{ id: Id; productName: string; quantity: number; reason: string }>
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
  /** Supplier credit notes applied to this order. */
  creditAmount: number
  outstandingAmount: number
  status: SupplierInvoiceStatus
}

export type Role = ValueOf<typeof roles>
export type Resource = ValueOf<typeof resources>
