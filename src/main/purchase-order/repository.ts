import { db } from '@main/db'
import { purchaseOrderDeliverySchema } from '@shared/schemas'
import type {
  NewPurchaseOrderItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderWithDetails
} from '@shared/types'
import { sql } from 'kysely'
import { randomUUID } from 'node:crypto'

interface CreateOrderInput {
  supplierId: number
  expectedAt: string | null
  notes: string | null
  createdBy: number
  items: Array<Pick<NewPurchaseOrderItem, 'drugId' | 'quantity' | 'unitCost'>>
}

interface DeliveryInput {
  itemId: number
  receivedQuantity: number
  batchNumber: string
  sellPrice: number
  expiresAt: string
}

interface RecordDeliveryInput {
  requestId: string
  deliveredAt: string
  notes: string | null
  recordedBy: number
  items: DeliveryInput[]
}

export async function findAll(): Promise<PurchaseOrderWithDetails[]> {
  const orders = await db
    .selectFrom('purchaseOrders')
    .innerJoin('suppliers', 'suppliers.id', 'purchaseOrders.supplierId')
    .innerJoin('accounts', 'accounts.id', 'purchaseOrders.createdBy')
    .select([
      'purchaseOrders.id',
      'purchaseOrders.supplierId',
      'purchaseOrders.orderNumber',
      'purchaseOrders.status',
      'purchaseOrders.orderedAt',
      'purchaseOrders.expectedAt',
      'purchaseOrders.receivedAt',
      'purchaseOrders.notes',
      'purchaseOrders.totalAmount',
      'purchaseOrders.createdBy',
      'purchaseOrders.createdAt',
      'purchaseOrders.updatedAt',
      'suppliers.organization as supplierName',
      'accounts.fullName as createdByName'
    ])
    .orderBy('purchaseOrders.createdAt', 'desc')
    .execute()

  const items = await db
    .selectFrom('purchaseOrderItems')
    .innerJoin('drugs', 'drugs.id', 'purchaseOrderItems.drugId')
    .select([
      'purchaseOrderItems.id',
      'purchaseOrderItems.purchaseOrderId',
      'purchaseOrderItems.drugId',
      'purchaseOrderItems.quantity',
      'purchaseOrderItems.unitCost',
      'purchaseOrderItems.receivedQuantity',
      'drugs.brandName',
      'drugs.genericName'
    ])
    .execute()

  return orders.map((order) => ({
    ...order,
    items: items
      .filter((item) => item.purchaseOrderId === order.id)
      .map((item) => ({
        id: item.id,
        purchaseOrderId: item.purchaseOrderId,
        drugId: item.drugId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        receivedQuantity: item.receivedQuantity,
        productName: `${item.brandName} (${item.genericName})`
      }))
  }))
}

export async function findOneById(id: number): Promise<PurchaseOrderWithDetails | null> {
  return (await findAll()).find((order) => order.id === id) ?? null
}

export async function insertOne(data: CreateOrderInput): Promise<PurchaseOrderWithDetails> {
  const orderId = await db.transaction().execute(async (transaction) => {
    const supplier = await transaction
      .selectFrom('suppliers')
      .select('id')
      .where('id', '=', data.supplierId)
      .executeTakeFirst()
    if (!supplier) throw new Error('Supplier not found.')

    const drugIds = [...new Set(data.items.map((item) => item.drugId))]
    const drugs = await transaction
      .selectFrom('drugs')
      .select('id')
      .where('id', 'in', drugIds)
      .where('isArchived', '=', 0)
      .execute()
    if (drugs.length !== drugIds.length) throw new Error('One or more products were not found.')

    const orderNumber = `PO-${new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`
    const totalAmount = data.items.reduce((total, item) => total + item.quantity * item.unitCost, 0)
    const order = await transaction
      .insertInto('purchaseOrders')
      .values({
        supplierId: data.supplierId,
        orderNumber,
        status: 'draft',
        expectedAt: data.expectedAt,
        notes: data.notes,
        totalAmount,
        createdBy: data.createdBy
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await transaction
      .insertInto('purchaseOrderItems')
      .values(
        data.items.map((item) => ({
          purchaseOrderId: order.id,
          drugId: item.drugId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          receivedQuantity: 0
        }))
      )
      .execute()

    return order.id
  })

  return (await findOneById(orderId)) as PurchaseOrderWithDetails
}

export async function updateDraftById(
  id: number,
  data: Omit<CreateOrderInput, 'createdBy'>
): Promise<PurchaseOrderWithDetails> {
  await db.transaction().execute(async (transaction) => {
    const order = await transaction
      .selectFrom('purchaseOrders')
      .select(['status', 'orderedAt'])
      .where('id', '=', id)
      .executeTakeFirst()
    if (!order) throw new Error('Purchase order not found.')
    if (order.status !== 'draft') {
      throw new Error(
        'Only draft orders can be edited. Submitted orders are already with the supplier; cancel and create a new order instead.'
      )
    }
    if (data.expectedAt && data.expectedAt < String(order.orderedAt).slice(0, 10)) {
      throw new Error('The expected delivery date cannot be before the order date.')
    }
    const supplier = await transaction
      .selectFrom('suppliers')
      .select('id')
      .where('id', '=', data.supplierId)
      .executeTakeFirst()
    if (!supplier) throw new Error('Supplier not found.')
    const drugIds = [...new Set(data.items.map((item) => item.drugId))]
    const drugs = await transaction
      .selectFrom('drugs')
      .select('id')
      .where('id', 'in', drugIds)
      .where('isArchived', '=', 0)
      .execute()
    if (drugs.length !== drugIds.length) throw new Error('One or more products were not found.')

    // Note: Draft lines have never been received, so replacing them loses no stock history.
    await transaction.deleteFrom('purchaseOrderItems').where('purchaseOrderId', '=', id).execute()
    await transaction
      .insertInto('purchaseOrderItems')
      .values(
        data.items.map((item) => ({
          purchaseOrderId: id,
          drugId: item.drugId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          receivedQuantity: 0
        }))
      )
      .execute()
    await transaction
      .updateTable('purchaseOrders')
      .set({
        supplierId: data.supplierId,
        expectedAt: data.expectedAt,
        notes: data.notes,
        totalAmount: data.items.reduce((total, item) => total + item.quantity * item.unitCost, 0),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where('id', '=', id)
      .where('status', '=', 'draft')
      .executeTakeFirstOrThrow()
  })

  return (await findOneById(id)) as PurchaseOrderWithDetails
}

export async function updateStatusById(
  id: number,
  status: PurchaseOrderStatus
): Promise<PurchaseOrderWithDetails> {
  await db
    .updateTable('purchaseOrders')
    .set({
      status,
      receivedAt: status === 'received' ? sql`CURRENT_TIMESTAMP` : null,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

  return (await findOneById(id)) as PurchaseOrderWithDetails
}

export async function recordDelivery(
  id: number,
  data: RecordDeliveryInput
): Promise<PurchaseOrderWithDetails> {
  const { recordedBy, ...payload } = data
  const { requestId, ...values } = purchaseOrderDeliverySchema.parse(payload)
  const fingerprint = JSON.stringify(values)
  await db.transaction().execute(async (transaction) => {
    const existing = await transaction
      .selectFrom('supplierDeliveries')
      .selectAll()
      .where('requestId', '=', requestId)
      .executeTakeFirst()
    if (existing) {
      if (
        existing.purchaseOrderId !== id ||
        existing.recordedBy !== recordedBy ||
        existing.requestFingerprint !== fingerprint
      )
        throw new Error('Delivery reference belongs to a different request.')
      return
    }
    const order = await transaction
      .selectFrom('purchaseOrders')
      .select(['supplierId', 'status'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    if (!['submitted', 'partially_received'].includes(order.status)) {
      throw new Error(
        order.status === 'draft'
          ? 'Submit the purchase order before recording a delivery.'
          : 'This purchase order is closed and cannot receive more stock.'
      )
    }

    const orderItems = await transaction
      .selectFrom('purchaseOrderItems')
      .selectAll()
      .where('purchaseOrderId', '=', id)
      .execute()
    const itemMap = new Map(orderItems.map((item) => [item.id, item]))
    const delivery = await transaction
      .insertInto('supplierDeliveries')
      .values({
        requestId,
        requestFingerprint: fingerprint,
        purchaseOrderId: id,
        supplierId: order.supplierId,
        deliveredAt: data.deliveredAt,
        notes: data.notes,
        recordedBy: data.recordedBy
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    for (const deliveredItem of data.items) {
      const item = itemMap.get(deliveredItem.itemId)
      if (!item) throw new Error('The delivery line does not belong to this order.')
      if (item.receivedQuantity + deliveredItem.receivedQuantity > item.quantity) {
        throw new Error(
          `Only ${item.quantity - item.receivedQuantity} unit(s) remain to be received for this line. Over-receiving is not allowed.`
        )
      }
      if (deliveredItem.expiresAt <= data.deliveredAt) {
        throw new Error('Delivered stock must expire after the delivery date.')
      }

      const existingBatch = await transaction
        .selectFrom('batches')
        .selectAll()
        .where('physicalTag', '=', deliveredItem.batchNumber)
        .executeTakeFirst()
      let batchId: number
      if (existingBatch) {
        const differences = [
          existingBatch.drugId !== item.drugId && 'product',
          existingBatch.supplierId !== order.supplierId && 'supplier',
          existingBatch.buyPrice !== item.unitCost && 'unit cost',
          existingBatch.sellPrice !== deliveredItem.sellPrice && 'selling price',
          String(existingBatch.expiresAt) !== deliveredItem.expiresAt && 'expiry date'
        ].filter(Boolean)
        if (differences.length > 0)
          throw new Error(
            `Batch number ${deliveredItem.batchNumber} is already recorded with a different ${differences.join(', ')}. Check the batch details or use the batch number printed on this delivery.`
          )
        await transaction
          .updateTable('batches')
          .set({
            initialStock: existingBatch.initialStock + deliveredItem.receivedQuantity,
            currentStock: existingBatch.currentStock + deliveredItem.receivedQuantity
          })
          .where('id', '=', existingBatch.id)
          .executeTakeFirstOrThrow()
        batchId = existingBatch.id
      } else {
        const batch = await transaction
          .insertInto('batches')
          .values({
            drugId: item.drugId,
            supplierId: order.supplierId,
            physicalTag: deliveredItem.batchNumber,
            buyPrice: item.unitCost,
            sellPrice: deliveredItem.sellPrice,
            initialStock: deliveredItem.receivedQuantity,
            currentStock: deliveredItem.receivedQuantity,
            expiresAt: deliveredItem.expiresAt
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        batchId = batch.id
      }

      item.receivedQuantity += deliveredItem.receivedQuantity
      await transaction
        .updateTable('purchaseOrderItems')
        .set({ receivedQuantity: item.receivedQuantity })
        .where('id', '=', deliveredItem.itemId)
        .executeTakeFirstOrThrow()
      await transaction
        .insertInto('supplierDeliveryItems')
        .values({
          deliveryId: delivery.id,
          purchaseOrderItemId: item.id,
          drugId: item.drugId,
          batchId,
          quantity: deliveredItem.receivedQuantity
        })
        .executeTakeFirstOrThrow()
    }

    const updatedItems = await transaction
      .selectFrom('purchaseOrderItems')
      .select(['quantity', 'receivedQuantity'])
      .where('purchaseOrderId', '=', id)
      .execute()
    const receivedCount = updatedItems.reduce((total, item) => total + item.receivedQuantity, 0)
    const orderedCount = updatedItems.reduce((total, item) => total + item.quantity, 0)
    const status: PurchaseOrderStatus =
      receivedCount === 0
        ? 'submitted'
        : receivedCount >= orderedCount
          ? 'received'
          : 'partially_received'

    await transaction
      .updateTable('purchaseOrders')
      .set({
        status,
        receivedAt: status === 'received' ? data.deliveredAt : null,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
  })

  return (await findOneById(id)) as PurchaseOrderWithDetails
}

export async function removeOneById(id: number): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await transaction.deleteFrom('purchaseOrderItems').where('purchaseOrderId', '=', id).execute()
    await transaction.deleteFrom('purchaseOrders').where('id', '=', id).executeTakeFirstOrThrow()
  })
}

export async function getById(id: number): Promise<PurchaseOrder | null> {
  return (await db
    .selectFrom('purchaseOrders')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()) as PurchaseOrder | null
}
