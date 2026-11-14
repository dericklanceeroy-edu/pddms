import { db } from '@main/db'
import { purchaseOrderDeliverySchema } from '@shared/schemas'
import type {
  Database,
  NewPurchaseOrderItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderWithDetails
} from '@shared/types'
import { piecesPerUnit, UnitError, type StockUnit } from '@shared/units'
import { sql, type Transaction } from 'kysely'
import { randomUUID } from 'node:crypto'

interface CreateOrderInput {
  supplierId: number
  expectedAt: string | null
  notes: string | null
  createdBy: number
  items: Array<
    Pick<NewPurchaseOrderItem, 'drugId' | 'quantity' | 'unitCost'> & { unit?: StockUnit }
  >
}

interface DeliveryInput {
  itemId: number
  receivedQuantity: number
  batchNumber: string
  sellPrice: number
  boxSellPrice?: number | null
  expiresAt: string
}

interface RecordDeliveryInput {
  requestId: string
  deliveredAt: string
  notes: string | null
  deliveredByName: string
  checkedByName: string
  recordedBy: number
  items: DeliveryInput[]
}

const PRICE_TOLERANCE = 0.000001

/** Builds stored lines, snapshotting how many pieces each ordered unit holds. */
async function orderLines(
  transaction: Transaction<Database>,
  purchaseOrderId: number,
  items: CreateOrderInput['items']
): Promise<NewPurchaseOrderItem[]> {
  const drugIds = [...new Set(items.map((item) => item.drugId))]
  const drugs = await transaction
    .selectFrom('drugs')
    .select(['id', 'brandName', 'piecesPerBox'])
    .where('id', 'in', drugIds)
    .where('isArchived', '=', 0)
    .execute()
  if (drugs.length !== drugIds.length) throw new Error('One or more products were not found.')
  return items.map((item) => {
    const drug = drugs.find((value) => value.id === item.drugId)!
    const unit = item.unit ?? 'piece'
    let pieces: number
    try {
      pieces = piecesPerUnit(unit, drug.piecesPerBox)
    } catch (error) {
      if (error instanceof UnitError) throw new Error(`${drug.brandName}: ${error.message}`)
      throw error
    }
    return {
      purchaseOrderId,
      drugId: item.drugId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unit,
      piecesPerUnit: pieces,
      receivedQuantity: 0
    }
  })
}

export async function findAll(): Promise<PurchaseOrderWithDetails[]> {
  const orders = await db
    .selectFrom('purchaseOrders')
    .innerJoin('suppliers', 'suppliers.id', 'purchaseOrders.supplierId')
    .innerJoin('accounts', 'accounts.id', 'purchaseOrders.createdBy')
    .leftJoin('accounts as submitter', 'submitter.id', 'purchaseOrders.submittedBy')
    .leftJoin('accounts as canceller', 'canceller.id', 'purchaseOrders.cancelledBy')
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
      'purchaseOrders.submittedBy',
      'purchaseOrders.submittedAt',
      'purchaseOrders.cancelledBy',
      'purchaseOrders.cancelledAt',
      'suppliers.organization as supplierName',
      'accounts.fullName as createdByName',
      'submitter.fullName as submittedByName',
      'canceller.fullName as cancelledByName'
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
      'purchaseOrderItems.unit',
      'purchaseOrderItems.piecesPerUnit',
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
        unit: item.unit,
        piecesPerUnit: item.piecesPerUnit,
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
    // Note: Validates products and box set-up before anything is written.
    await orderLines(transaction, 0, data.items)

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
      .values(await orderLines(transaction, order.id, data.items))
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
    const lines = await orderLines(transaction, id, data.items)

    // Note: Draft lines have never been received, so replacing them loses no stock history.
    await transaction.deleteFrom('purchaseOrderItems').where('purchaseOrderId', '=', id).execute()
    await transaction.insertInto('purchaseOrderItems').values(lines).execute()
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
  status: PurchaseOrderStatus,
  accountId: number
): Promise<PurchaseOrderWithDetails> {
  const current = await db
    .selectFrom('purchaseOrders')
    .select('status')
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  const changed = current.status !== status
  const now = new Date().toISOString()
  await db
    .updateTable('purchaseOrders')
    .set({
      status,
      receivedAt: status === 'received' ? sql`CURRENT_TIMESTAMP` : null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      ...(changed && status === 'submitted' ? { submittedBy: accountId, submittedAt: now } : {}),
      ...(changed && status === 'cancelled' ? { cancelledBy: accountId, cancelledAt: now } : {})
    })
    .where('id', '=', id)
    .where('status', '=', current.status)
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
      .select(['supplierId', 'status', 'orderedAt'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    if (data.deliveredAt < String(order.orderedAt).slice(0, 10)) {
      throw new Error('The delivery date cannot be before the purchase order date.')
    }
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
        deliveredByName: data.deliveredByName,
        checkedByName: data.checkedByName,
        recordedBy: data.recordedBy
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    for (const deliveredItem of data.items) {
      const item = itemMap.get(deliveredItem.itemId)
      if (!item) throw new Error('The delivery line does not belong to this order.')
      if (item.receivedQuantity + deliveredItem.receivedQuantity > item.quantity) {
        throw new Error(
          `Only ${item.quantity - item.receivedQuantity} ${item.unit === 'box' ? 'box(es)' : 'piece(s)'} remain to be received for this line. Over-receiving is not allowed.`
        )
      }
      const drug = await transaction
        .selectFrom('drugs')
        .select(['piecesPerBox'])
        .where('id', '=', item.drugId)
        .executeTakeFirstOrThrow()
      const boxSellPrice = deliveredItem.boxSellPrice ?? null
      if (boxSellPrice !== null && drug.piecesPerBox <= 1)
        throw new Error(
          'A box price needs a product with more than one piece per box. Set pieces per box on the product first.'
        )
      // Note: Stock and batch prices are per piece; a box line converts here.
      const receivedPieces = deliveredItem.receivedQuantity * item.piecesPerUnit
      const buyPrice = item.unitCost / item.piecesPerUnit
      if (deliveredItem.expiresAt <= data.deliveredAt) {
        throw new Error('Delivered stock must expire after the delivery date.')
      }
      // Note: Compare like with like: piece price to cost per piece, box price to cost per box.
      if (deliveredItem.sellPrice < buyPrice - PRICE_TOLERANCE) {
        throw new Error(
          `Batch ${deliveredItem.batchNumber}: the selling price cannot be lower than the unit cost of ₱${buyPrice.toFixed(2)} per piece.`
        )
      }
      const boxCost = buyPrice * drug.piecesPerBox
      if (boxSellPrice !== null && boxSellPrice < boxCost - PRICE_TOLERANCE) {
        throw new Error(
          `Batch ${deliveredItem.batchNumber}: the box price cannot be lower than the cost of ₱${boxCost.toFixed(2)} per box.`
        )
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
          Math.abs(existingBatch.buyPrice - buyPrice) > PRICE_TOLERANCE && 'unit cost',
          existingBatch.sellPrice !== deliveredItem.sellPrice && 'selling price',
          (existingBatch.boxSellPrice ?? null) !== boxSellPrice && 'box price',
          String(existingBatch.expiresAt) !== deliveredItem.expiresAt && 'expiry date'
        ].filter(Boolean)
        if (differences.length > 0)
          throw new Error(
            `Batch number ${deliveredItem.batchNumber} is already recorded with a different ${differences.join(', ')}. Check the batch details or use the batch number printed on this delivery.`
          )
        await transaction
          .updateTable('batches')
          .set({
            initialStock: existingBatch.initialStock + receivedPieces,
            currentStock: existingBatch.currentStock + receivedPieces
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
            buyPrice,
            sellPrice: deliveredItem.sellPrice,
            boxSellPrice,
            initialStock: receivedPieces,
            currentStock: receivedPieces,
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
