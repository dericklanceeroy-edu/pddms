import { db } from '@main/db'
import { sql, type Kysely } from 'kysely'
import type {
  Database,
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

/**
 * What each purchase order owes: the delivered value at the invoice cost of each delivery
 * (rejected boxes are not included), less supplier credit notes applied to it, less payments.
 */
export async function orderBalances(
  database: Kysely<Database>,
  orderIds?: number[]
): Promise<Map<number, { delivered: number; credits: number; paid: number; outstanding: number }>> {
  const filter = (column: string): ReturnType<typeof sql> =>
    orderIds ? sql`AND ${sql.ref(column)} IN (${sql.join(orderIds.length ? orderIds : [0])})` : sql``
  const rows = (
    await sql<{ id: number; delivered: number; credits: number; paid: number }>`SELECT po.id,
      COALESCE((SELECT SUM(i.quantity * i.unit_cost) FROM supplier_delivery_items i JOIN supplier_deliveries d ON d.id = i.delivery_id WHERE d.purchase_order_id = po.id), 0) AS delivered,
      COALESCE((SELECT SUM(amount) FROM supplier_credit_notes WHERE purchase_order_id = po.id), 0) AS credits,
      COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE purchase_order_id = po.id), 0) AS paid
      FROM purchase_orders po WHERE 1 = 1 ${filter('po.id')}`.execute(database)
  ).rows
  const money = (value: number): number => Number(Number(value).toFixed(2))
  return new Map(
    rows.map((row) => {
      const delivered = money(row.delivered)
      const credits = money(row.credits)
      const paid = money(row.paid)
      return [
        row.id,
        { delivered, credits, paid, outstanding: Math.max(0, money(delivered - credits - paid)) }
      ]
    })
  )
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
      'supplierDeliveries.deliveredByName',
      'supplierDeliveries.checkedByName',
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
      'purchaseOrderItems.unit',
      'purchaseOrderItems.piecesPerUnit as orderedPiecesPerUnit',
      'purchaseOrderItems.unitCost as orderedUnitCost',
      'supplierDeliveryItems.piecesPerUnit',
      'supplierDeliveryItems.unitCost',
      'supplierDeliveryItems.differenceReason',
      'drugs.brandName',
      'drugs.genericName',
      'batches.id as batchId',
      'batches.physicalTag',
      'batches.expiresAt'
    ])
    .execute()
  const rejections = await db
    .selectFrom('supplierDeliveryRejections')
    .innerJoin('drugs', 'drugs.id', 'supplierDeliveryRejections.drugId')
    .select([
      'supplierDeliveryRejections.id',
      'supplierDeliveryRejections.deliveryId',
      'supplierDeliveryRejections.quantity',
      'supplierDeliveryRejections.reason',
      'drugs.brandName',
      'drugs.genericName'
    ])
    .execute()

  return deliveries.map((delivery) => ({
    ...delivery,
    rejections: rejections
      .filter((item) => item.deliveryId === delivery.id)
      .map((item) => ({
        id: item.id,
        productName: `${item.brandName} (${item.genericName})`,
        quantity: item.quantity,
        reason: item.reason
      })),
    items: items
      .filter((item) => item.deliveryId === delivery.id)
      .map((item) => ({
        id: item.id,
        productName: `${item.brandName} (${item.genericName})`,
        batchNumber: item.physicalTag ?? `Batch ${item.batchId}`,
        quantity: item.quantity,
        orderedQuantity: item.orderedQuantity,
        unit: item.unit,
        piecesPerUnit: item.piecesPerUnit,
        orderedPiecesPerUnit: item.orderedPiecesPerUnit,
        unitCost: item.unitCost,
        orderedUnitCost: item.orderedUnitCost,
        differenceReason: item.differenceReason,
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
  // Note: A supplier credit note applied to an order settles its invoices like a payment.
  const credits = await db
    .selectFrom('supplierCreditNotes')
    .select(['purchaseOrderId', 'amount'])
    .where('purchaseOrderId', 'is not', null)
    .orderBy('id')
    .execute()
  const paidByInvoice = allocatePayments(invoices, [
    ...payments,
    ...credits.map((credit) => ({
      purchaseOrderId: credit.purchaseOrderId!,
      invoiceId: null,
      amount: credit.amount
    }))
  ])

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
  const balances = await orderBalances(db)
  return orders
    .map((order) => {
      const balance = balances.get(order.purchaseOrderId)!
      const status: SupplierInvoiceStatus =
        balance.paid + balance.credits === 0
          ? 'unpaid'
          : balance.outstanding === 0
            ? 'paid'
            : 'partially_paid'
      return {
        ...order,
        totalAmount: balance.delivered,
        paidAmount: balance.paid,
        creditAmount: balance.credits,
        outstandingAmount: balance.outstanding,
        status
      }
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
    // Note: Invoices cannot bill more than was ordered (or, on a cancelled order, received).
    // Note: Delivered lines count at their invoice cost; boxes still to come at the order cost.
    const lines = await transaction
      .selectFrom('purchaseOrderItems')
      .select(['quantity', 'receivedQuantity', 'unitCost'])
      .where('purchaseOrderId', '=', data.purchaseOrderId)
      .execute()
    const delivered = (await orderBalances(transaction, [data.purchaseOrderId])).get(
      data.purchaseOrderId
    )!.delivered
    const orderValue =
      delivered +
      (order.status === 'cancelled'
        ? 0
        : lines.reduce(
            (sum, line) => sum + (line.quantity - line.receivedQuantity) * line.unitCost,
            0
          ))
    const invoiced = await transaction
      .selectFrom('supplierInvoices')
      .select((eb) => eb.fn.sum<number>('amount').as('total'))
      .where('purchaseOrderId', '=', data.purchaseOrderId)
      .executeTakeFirstOrThrow()
    const already = Number(invoiced.total ?? 0)
    if (already + data.amount > orderValue + 0.005)
      throw new Error(
        `Invoices for this order cannot exceed the order value of ₱${orderValue.toFixed(2)}${already > 0 ? ` (₱${already.toFixed(2)} is already invoiced)` : ''}. Check the amount.`
      )

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

export async function findInvoiceFile(
  id: number
): Promise<{ storedFilename: string; originalFilename: string } | null> {
  return (
    (await db
      .selectFrom('supplierInvoices')
      .select(['storedFilename', 'originalFilename'])
      .where('id', '=', id)
      .executeTakeFirst()) ?? null
  )
}

export async function insertPayment(data: PaymentInput): Promise<SupplierPaymentWithDetails> {
  const paymentId = await db.transaction().execute(async (transaction) => {
    const order = await transaction
      .selectFrom('purchaseOrders')
      .select(['id', 'supplierId', 'status', 'orderedAt'])
      .where('id', '=', data.purchaseOrderId)
      .executeTakeFirst()
    if (!order) throw new Error('Purchase order not found.')
    if (!['partially_received', 'received', 'cancelled'].includes(order.status)) {
      throw new Error('Record a supplier delivery before recording a payment.')
    }
    if (data.paidAt < String(order.orderedAt).slice(0, 10)) {
      throw new Error('The payment date cannot be before the purchase order date.')
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

    const amount = Number(data.amount.toFixed(2))
    const remaining = (await orderBalances(transaction, [order.id])).get(order.id)!.outstanding
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
