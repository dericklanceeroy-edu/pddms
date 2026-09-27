import { db } from '@main/db'
import type {
  PurchaseOrderPaymentSummary,
  SupplierDeliveryWithDetails,
  SupplierInvoiceStatus,
  SupplierInvoiceWithDetails,
  SupplierPaymentWithDetails
} from '@shared/types'

interface InvoiceFileInput {
  purchaseOrderId: number
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  amount: number
  originalFilename: string
  storedFilename: string
  mimeType: string
  fileSize: number
  uploadedBy: number
}

interface PaymentInput {
  purchaseOrderId: number
  invoiceId: number | null
  amount: number
  paidAt: string
  method: string
  referenceNumber: string | null
  notes: string | null
  recordedBy: number
}

interface InvoiceAllocationInput {
  id: number
  purchaseOrderId: number
  amount: number
}

interface PaymentAllocationInput {
  purchaseOrderId: number
  invoiceId: number | null
  amount: number
}

const localDate = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const deadlineStatus = (
  dueDate: string,
  status: SupplierInvoiceStatus
): SupplierInvoiceWithDetails['deadlineStatus'] => {
  if (status === 'paid') return 'paid'
  const day = 24 * 60 * 60 * 1000
  const daysRemaining = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${localDate()}T00:00:00Z`)) / day
  )
  if (daysRemaining < 0) return 'overdue'
  if (daysRemaining <= 7) return 'due_soon'
  return 'upcoming'
}

const allocatePayments = (
  invoices: InvoiceAllocationInput[],
  payments: PaymentAllocationInput[]
): Map<number, number> => {
  const directByInvoice = new Map<number, number>()
  const unassignedByOrder = new Map<number, number>()
  for (const payment of payments) {
    if (payment.invoiceId) {
      directByInvoice.set(
        payment.invoiceId,
        (directByInvoice.get(payment.invoiceId) ?? 0) + payment.amount
      )
    } else {
      unassignedByOrder.set(
        payment.purchaseOrderId,
        (unassignedByOrder.get(payment.purchaseOrderId) ?? 0) + payment.amount
      )
    }
  }
  const paidByInvoice = new Map<number, number>()
  for (const invoice of invoices) {
    const direct = Math.min(invoice.amount, directByInvoice.get(invoice.id) ?? 0)
    const pool = unassignedByOrder.get(invoice.purchaseOrderId) ?? 0
    const allocated = Math.min(invoice.amount - direct, pool)
    paidByInvoice.set(invoice.id, Number((direct + allocated).toFixed(2)))
    unassignedByOrder.set(invoice.purchaseOrderId, Number((pool - allocated).toFixed(2)))
  }
  return paidByInvoice
}

export async function findDeliveries(): Promise<SupplierDeliveryWithDetails[]> {
  const deliveries = await db
    .selectFrom('supplierDeliveries')
    .innerJoin('purchaseOrders', 'purchaseOrders.id', 'supplierDeliveries.purchaseOrderId')
    .innerJoin('suppliers', 'suppliers.id', 'supplierDeliveries.supplierId')
    .innerJoin('accounts', 'accounts.id', 'supplierDeliveries.recordedBy')
    .select([
      'supplierDeliveries.id',
      'supplierDeliveries.purchaseOrderId',
      'supplierDeliveries.supplierId',
      'supplierDeliveries.deliveredAt',
      'supplierDeliveries.notes',
      'supplierDeliveries.recordedBy',
      'supplierDeliveries.createdAt',
      'purchaseOrders.orderNumber',
      'suppliers.organization as supplierName',
      'accounts.fullName as recordedByName'
    ])
    .orderBy('supplierDeliveries.deliveredAt', 'desc')
    .execute()
  const items = await db
    .selectFrom('supplierDeliveryItems')
    .innerJoin(
      'purchaseOrderItems',
      'purchaseOrderItems.id',
      'supplierDeliveryItems.purchaseOrderItemId'
    )
    .innerJoin('drugs', 'drugs.id', 'supplierDeliveryItems.drugId')
    .innerJoin('batches', 'batches.id', 'supplierDeliveryItems.batchId')
    .select([
      'supplierDeliveryItems.id',
      'supplierDeliveryItems.deliveryId',
      'supplierDeliveryItems.quantity',
      'purchaseOrderItems.quantity as orderedQuantity',
      'drugs.brandName',
      'drugs.genericName',
      'batches.id as batchId',
      'batches.physicalTag',
      'batches.expiresAt'
    ])
    .execute()

  return deliveries.map((delivery) => ({
    ...delivery,
    items: items
      .filter((item) => item.deliveryId === delivery.id)
      .map((item) => ({
        id: item.id,
        productName: `${item.brandName} (${item.genericName})`,
        batchNumber: item.physicalTag ?? `Batch ${item.batchId}`,
        quantity: item.quantity,
        orderedQuantity: item.orderedQuantity,
        expiresAt: String(item.expiresAt)
      }))
  }))
}

export async function findInvoices(): Promise<SupplierInvoiceWithDetails[]> {
  const invoices = await db
    .selectFrom('supplierInvoices')
    .innerJoin('purchaseOrders', 'purchaseOrders.id', 'supplierInvoices.purchaseOrderId')
    .innerJoin('suppliers', 'suppliers.id', 'supplierInvoices.supplierId')
    .innerJoin('accounts', 'accounts.id', 'supplierInvoices.uploadedBy')
    .select([
      'supplierInvoices.id',
      'supplierInvoices.supplierId',
      'supplierInvoices.purchaseOrderId',
      'supplierInvoices.invoiceNumber',
      'supplierInvoices.invoiceDate',
      'supplierInvoices.dueDate',
      'supplierInvoices.amount',
      'supplierInvoices.status',
      'supplierInvoices.originalFilename',
      'supplierInvoices.storedFilename',
      'supplierInvoices.mimeType',
      'supplierInvoices.fileSize',
      'supplierInvoices.uploadedBy',
      'supplierInvoices.createdAt',
      'purchaseOrders.orderNumber',
      'suppliers.organization as supplierName',
      'accounts.fullName as uploadedByName'
    ])
    .orderBy('supplierInvoices.dueDate')
    .orderBy('supplierInvoices.id')
    .execute()
  const payments = await db
    .selectFrom('supplierPayments')
    .select(['purchaseOrderId', 'invoiceId', 'amount'])
    .orderBy('id')
    .execute()
  const paidByInvoice = allocatePayments(invoices, payments)

  return invoices.map((invoice) => {
    const paidAmount = paidByInvoice.get(invoice.id) ?? 0
    const outstandingAmount = Math.max(0, Number((invoice.amount - paidAmount).toFixed(2)))
    const status: SupplierInvoiceStatus =
      paidAmount === 0 ? 'unpaid' : outstandingAmount === 0 ? 'paid' : 'partially_paid'
    return {
      ...invoice,
      status,
      paidAmount,
      outstandingAmount,
      deadlineStatus: deadlineStatus(invoice.dueDate, status)
    }
  })
}

export async function findPaymentSummaries(): Promise<PurchaseOrderPaymentSummary[]> {
  const orders = await db
    .selectFrom('purchaseOrders')
    .innerJoin('suppliers', 'suppliers.id', 'purchaseOrders.supplierId')
    .select([
      'purchaseOrders.id as purchaseOrderId',
      'purchaseOrders.supplierId',
      'purchaseOrders.orderNumber',
      'suppliers.organization as supplierName'
    ])
    .where('purchaseOrders.status', 'in', ['partially_received', 'received', 'cancelled'])
    .orderBy('purchaseOrders.orderedAt', 'desc')
    .execute()
  const items = await db
    .selectFrom('purchaseOrderItems')
    .select(['purchaseOrderId', 'receivedQuantity', 'unitCost'])
    .execute()
  const paidRows = await db
    .selectFrom('supplierPayments')
    .select('purchaseOrderId')
    .select(({ fn }) => fn.sum<number>('amount').as('paidAmount'))
    .groupBy('purchaseOrderId')
    .execute()
  const paidByOrder = new Map(
    paidRows.map((payment) => [payment.purchaseOrderId, Number(payment.paidAmount)])
  )

  return orders
    .map((order) => {
      const totalAmount = Number(
        items
          .filter((item) => item.purchaseOrderId === order.purchaseOrderId)
          .reduce((total, item) => total + item.receivedQuantity * item.unitCost, 0)
          .toFixed(2)
      )
      const paidAmount = Number((paidByOrder.get(order.purchaseOrderId) ?? 0).toFixed(2))
      const outstandingAmount = Math.max(0, Number((totalAmount - paidAmount).toFixed(2)))
      const status: SupplierInvoiceStatus =
        paidAmount === 0 ? 'unpaid' : outstandingAmount === 0 ? 'paid' : 'partially_paid'
      return { ...order, totalAmount, paidAmount, outstandingAmount, status }
    })
    .filter((order) => order.totalAmount > 0)
}

export async function findPayments(): Promise<SupplierPaymentWithDetails[]> {
  return await db
    .selectFrom('supplierPayments')
    .leftJoin('supplierInvoices', 'supplierInvoices.id', 'supplierPayments.invoiceId')
    .innerJoin('purchaseOrders', 'purchaseOrders.id', 'supplierPayments.purchaseOrderId')
    .innerJoin('suppliers', 'suppliers.id', 'supplierPayments.supplierId')
    .innerJoin('accounts', 'accounts.id', 'supplierPayments.recordedBy')
    .select([
      'supplierPayments.id',
      'supplierPayments.supplierId',
      'supplierPayments.purchaseOrderId',
      'supplierPayments.invoiceId',
      'supplierPayments.amount',
      'supplierPayments.paidAt',
      'supplierPayments.method',
      'supplierPayments.referenceNumber',
      'supplierPayments.notes',
      'supplierPayments.recordedBy',
      'supplierPayments.createdAt',
      'supplierInvoices.invoiceNumber',
      'purchaseOrders.orderNumber',
      'suppliers.organization as supplierName',
      'accounts.fullName as recordedByName'
    ])
    .orderBy('supplierPayments.paidAt', 'desc')
    .execute()
}

export async function insertInvoice(data: InvoiceFileInput): Promise<SupplierInvoiceWithDetails> {
  const invoiceId = await db.transaction().execute(async (transaction) => {
    const order = await transaction
      .selectFrom('purchaseOrders')
      .select(['supplierId', 'status'])
      .where('id', '=', data.purchaseOrderId)
      .executeTakeFirst()
    if (!order) throw new Error('Purchase order not found.')
    const received = await transaction
      .selectFrom('purchaseOrderItems')
      .select('id')
      .where('purchaseOrderId', '=', data.purchaseOrderId)
      .where('receivedQuantity', '>', 0)
      .executeTakeFirst()
    if (
      !['submitted', 'partially_received', 'received'].includes(order.status) &&
      !(order.status === 'cancelled' && received)
    ) {
      throw new Error('Submit the purchase order before attaching an invoice.')
    }
    if (data.dueDate < data.invoiceDate) {
      throw new Error('The payment due date cannot be before the invoice date.')
    }
    const duplicate = await transaction
      .selectFrom('supplierInvoices')
      .select('id')
      .where('supplierId', '=', order.supplierId)
      .where('invoiceNumber', '=', data.invoiceNumber)
      .executeTakeFirst()
    if (duplicate) throw new Error('That invoice number already exists for this supplier.')

    const invoice = await transaction
      .insertInto('supplierInvoices')
      .values({ ...data, supplierId: order.supplierId, status: 'unpaid' })
      .returning('id')
      .executeTakeFirstOrThrow()
    const invoices = await transaction
      .selectFrom('supplierInvoices')
      .select(['id', 'purchaseOrderId', 'amount'])
      .where('purchaseOrderId', '=', data.purchaseOrderId)
      .orderBy('dueDate')
      .orderBy('id')
      .execute()
    const payments = await transaction
      .selectFrom('supplierPayments')
      .select(['purchaseOrderId', 'invoiceId', 'amount'])
      .where('purchaseOrderId', '=', data.purchaseOrderId)
      .orderBy('id')
      .execute()
    const paidByInvoice = allocatePayments(invoices, payments)
    for (const record of invoices) {
      const paid = paidByInvoice.get(record.id) ?? 0
      const status: SupplierInvoiceStatus =
        paid <= 0 ? 'unpaid' : paid >= record.amount ? 'paid' : 'partially_paid'
      await transaction
        .updateTable('supplierInvoices')
        .set({ status })
        .where('id', '=', record.id)
        .executeTakeFirstOrThrow()
    }
    return invoice.id
  })
  return (await findInvoices()).find(
    (record) => record.id === invoiceId
  ) as SupplierInvoiceWithDetails
}

export async function findInvoiceFile(id: number): Promise<{ storedFilename: string } | null> {
  return (
    (await db
      .selectFrom('supplierInvoices')
      .select('storedFilename')
      .where('id', '=', id)
      .executeTakeFirst()) ?? null
  )
}

export async function insertPayment(data: PaymentInput): Promise<SupplierPaymentWithDetails> {
  const paymentId = await db.transaction().execute(async (transaction) => {
    const order = await transaction
      .selectFrom('purchaseOrders')
      .select(['id', 'supplierId', 'status'])
      .where('id', '=', data.purchaseOrderId)
      .executeTakeFirst()
    if (!order) throw new Error('Purchase order not found.')
    if (!['partially_received', 'received', 'cancelled'].includes(order.status)) {
      throw new Error('Record a supplier delivery before recording a payment.')
    }

    if (data.invoiceId) {
      const invoice = await transaction
        .selectFrom('supplierInvoices')
        .select(['id', 'purchaseOrderId', 'supplierId', 'amount'])
        .where('id', '=', data.invoiceId)
        .executeTakeFirst()
      if (!invoice) throw new Error('Supplier invoice not found.')
      if (invoice.purchaseOrderId !== order.id || invoice.supplierId !== order.supplierId) {
        throw new Error('The supplier invoice does not belong to this purchase order.')
      }
      const orderInvoices = await transaction
        .selectFrom('supplierInvoices')
        .select(['id', 'purchaseOrderId', 'amount'])
        .where('purchaseOrderId', '=', order.id)
        .orderBy('dueDate')
        .orderBy('id')
        .execute()
      const orderPayments = await transaction
        .selectFrom('supplierPayments')
        .select(['purchaseOrderId', 'invoiceId', 'amount'])
        .where('purchaseOrderId', '=', order.id)
        .orderBy('id')
        .execute()
      const invoicePaid = allocatePayments(orderInvoices, orderPayments).get(invoice.id) ?? 0
      if (data.amount > Number((invoice.amount - invoicePaid).toFixed(2))) {
        throw new Error('Payment cannot exceed the selected invoice balance.')
      }
    }

    if (data.referenceNumber) {
      const duplicate = await transaction
        .selectFrom('supplierPayments')
        .select('id')
        .where('referenceNumber', '=', data.referenceNumber)
        .executeTakeFirst()
      if (duplicate) throw new Error('That payment reference has already been recorded.')
    }

    const paid = await transaction
      .selectFrom('supplierPayments')
      .select(({ fn }) => fn.sum<number>('amount').as('amount'))
      .where('purchaseOrderId', '=', order.id)
      .executeTakeFirstOrThrow()
    const orderItems = await transaction
      .selectFrom('purchaseOrderItems')
      .select(['receivedQuantity', 'unitCost'])
      .where('purchaseOrderId', '=', order.id)
      .execute()
    const paidAmount = Number(paid.amount ?? 0)
    const amount = Number(data.amount.toFixed(2))
    const totalAmount = Number(
      orderItems
        .reduce((total, item) => total + item.receivedQuantity * item.unitCost, 0)
        .toFixed(2)
    )
    const remaining = Number((totalAmount - paidAmount).toFixed(2))
    if (remaining <= 0) throw new Error('This purchase order is already paid.')
    if (amount > remaining) throw new Error('Payment cannot exceed the delivered order balance.')

    const payment = await transaction
      .insertInto('supplierPayments')
      .values({
        ...data,
        amount,
        supplierId: order.supplierId
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const invoices = await transaction
      .selectFrom('supplierInvoices')
      .select(['id', 'purchaseOrderId', 'amount'])
      .where('purchaseOrderId', '=', order.id)
      .orderBy('dueDate')
      .orderBy('id')
      .execute()
    const payments = await transaction
      .selectFrom('supplierPayments')
      .select(['purchaseOrderId', 'invoiceId', 'amount'])
      .where('purchaseOrderId', '=', order.id)
      .orderBy('id')
      .execute()
    const paidByInvoice = allocatePayments(invoices, payments)
    for (const invoice of invoices) {
      const invoicePaid = paidByInvoice.get(invoice.id) ?? 0
      const status: SupplierInvoiceStatus =
        invoicePaid <= 0 ? 'unpaid' : invoicePaid >= invoice.amount ? 'paid' : 'partially_paid'
      await transaction
        .updateTable('supplierInvoices')
        .set({ status })
        .where('id', '=', invoice.id)
        .executeTakeFirstOrThrow()
    }
    return payment.id
  })

  return (await findPayments()).find(
    (payment) => payment.id === paymentId
  ) as SupplierPaymentWithDetails
}
