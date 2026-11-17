import { noteAudit } from '@main/audit/repository'
import { db } from '@main/db'
import { purchaseOrderDeliverySchema } from '@shared/schemas'
import type {
  Database,
  NewPurchaseOrderItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderWithDetails
} from '@shared/types'
import { priceOn } from '@main/price-list/repository'
import { localDate } from '@shared/inventory'
import { sql, type Transaction } from 'kysely'
import { randomUUID } from 'node:crypto'

interface CreateOrderInput {
  supplierId: number
  expectedAt: string | null
  notes: string | null
  createdBy: number
  /** Packs from the supplier's price list and the number of boxes of each. */
  items: Array<{ packId: number; quantity: number }>
}

interface DeliveryInput {
  itemId: number
  receivedQuantity: number
  rejectedQuantity: number
  rejectionReason: string
  piecesPerBox: number | null
  unitCost: number | null
  differenceReason: string
  batchNumber: string
  sellPrice: number | null
  boxSellPrice?: number | null
  wholesaleBoxPrice?: number | null
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

/**
 * Builds stored lines from the supplier's price list: the pack fixes the product, the box size
 * and the agreed cost per box in effect on the given date. Nothing typed by the person placing
 * the order changes the price.
 */
async function orderLines(
  transaction: Transaction<Database>,
  purchaseOrderId: number,
  supplierId: number,
  items: CreateOrderInput['items'],
  date = localDate()
): Promise<NewPurchaseOrderItem[]> {
  const packIds = [...new Set(items.map((item) => item.packId))]
  const packs = await transaction
    .selectFrom('supplierPacks')
    .innerJoin('drugs', 'drugs.id', 'supplierPacks.drugId')
    .select([
      'supplierPacks.id',
      'supplierPacks.supplierId',
      'supplierPacks.drugId',
      'supplierPacks.piecesPerBox',
      'supplierPacks.isArchived',
      'drugs.brandName',
      'drugs.isArchived as productArchived'
    ])
    .where('supplierPacks.id', 'in', packIds)
    .execute()
  const lines: NewPurchaseOrderItem[] = []
  for (const item of items) {
    const pack = packs.find((value) => value.id === item.packId)
    if (!pack || pack.isArchived || pack.productArchived)
      throw new Error('A pack on this order is no longer on the price list. Pick it again.')
    if (pack.supplierId !== supplierId)
      throw new Error(`${pack.brandName}: this pack belongs to a different supplier's price list.`)
    const unitCost = await priceOn(transaction, pack.id, date)
    if (unitCost === null)
      throw new Error(
        `${pack.brandName} (box of ${pack.piecesPerBox}) has no agreed price in effect yet. Ask the administrator to set it in the price list.`
      )
    lines.push({
      purchaseOrderId,
      drugId: pack.drugId,
      packId: pack.id,
      quantity: item.quantity,
      unitCost,
      unit: 'box',
      piecesPerUnit: pack.piecesPerBox,
      receivedQuantity: 0
    })
  }
  return lines
}

const lineTotal = (lines: Array<{ quantity: number; unitCost: number }>): number =>
  Number(lines.reduce((total, line) => total + line.quantity * line.unitCost, 0).toFixed(2))

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
      'purchaseOrderItems.packId',
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
        packId: item.packId,
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
    // Note: Validates the packs and their prices before anything is written.
    const priced = await orderLines(transaction, 0, data.supplierId, data.items)

    const orderNumber = `PO-${new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`
    const totalAmount = lineTotal(priced)
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
      .values(priced.map((line) => ({ ...line, purchaseOrderId: order.id })))
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
    const lines = await orderLines(transaction, id, data.supplierId, data.items)

    // Note: Draft lines have never been received, so replacing them loses no stock history.
    await transaction.deleteFrom('purchaseOrderItems').where('purchaseOrderId', '=', id).execute()
    await transaction.insertInto('purchaseOrderItems').values(lines).execute()
    await transaction
      .updateTable('purchaseOrders')
      .set({
        supplierId: data.supplierId,
        expectedAt: data.expectedAt,
        notes: data.notes,
        totalAmount: lineTotal(lines),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where('id', '=', id)
      .where('status', '=', 'draft')
      .executeTakeFirstOrThrow()
  })

  return (await findOneById(id)) as PurchaseOrderWithDetails
}

const statusLabel = (status: string): string =>
  status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())

export async function updateStatusById(
  id: number,
  status: PurchaseOrderStatus,
  accountId: number
): Promise<PurchaseOrderWithDetails> {
  const current = await db
    .selectFrom('purchaseOrders')
    .select(['status', 'orderNumber'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  const changed = current.status !== status
  const now = new Date().toISOString()
  await db.transaction().execute(async (transaction) => {
  if (changed && status === 'submitted') {
    // Note: The order goes to the supplier at the agreed price in effect on the day it is sent.
    const order = await transaction
      .selectFrom('purchaseOrders')
      .select('supplierId')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    const lines = await transaction
      .selectFrom('purchaseOrderItems')
      .select(['id', 'packId', 'quantity', 'unitCost'])
      .where('purchaseOrderId', '=', id)
      .execute()
    if (lines.some((line) => line.packId === null))
      throw new Error(
        'This draft was made before the supplier price list. Edit it and pick each pack from the price list, then submit.'
      )
    const priced = await orderLines(
      transaction,
      id,
      order.supplierId,
      lines.map((line) => ({ packId: line.packId!, quantity: line.quantity }))
    )
    for (const [index, line] of lines.entries())
      await transaction
        .updateTable('purchaseOrderItems')
        .set({ unitCost: priced[index].unitCost })
        .where('id', '=', line.id)
        .execute()
    await transaction
      .updateTable('purchaseOrders')
      .set({ totalAmount: lineTotal(priced) })
      .where('id', '=', id)
      .execute()
  }
  await transaction
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
  })
  // Note: The activity log shows the status before and after (L9).
  if (changed)
    noteAudit({
      summary: `Purchase order ${current.orderNumber}: ${statusLabel(current.status)} → ${statusLabel(status)}`,
      changes: [{ field: 'Status', from: statusLabel(current.status), to: statusLabel(status) }]
    })

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
      // Note: Received and rejected boxes in one delivery together cannot exceed what is still
      // open on the line (L5): a 2-box line cannot arrive as 2 good and 1 damaged.
      const open = item.quantity - item.receivedQuantity
      if (deliveredItem.receivedQuantity + deliveredItem.rejectedQuantity > open) {
        const unit = item.unit === 'box' ? 'box(es)' : 'piece(s)'
        throw new Error(
          `Received and rejected together cannot exceed the ${open} ${unit} still open on this line (${deliveredItem.receivedQuantity} received + ${deliveredItem.rejectedQuantity} rejected).`
        )
      }
      // Note: Rejected boxes never enter stock and are not owed to the supplier, so the line
      // stays open for a replacement delivery.
      if (deliveredItem.rejectedQuantity > 0)
        await transaction
          .insertInto('supplierDeliveryRejections')
          .values({
            deliveryId: delivery.id,
            purchaseOrderItemId: item.id,
            drugId: item.drugId,
            quantity: deliveredItem.rejectedQuantity,
            reason: deliveredItem.rejectionReason
          })
          .execute()
      if (deliveredItem.receivedQuantity === 0) continue

      // Note: What actually arrived. A different box size or invoice cost needs a reason; the
      // administrator reviews these differences against the price list.
      const piecesPerBox =
        item.unit === 'box' ? (deliveredItem.piecesPerBox ?? item.piecesPerUnit) : 1
      const unitCost = deliveredItem.unitCost ?? item.unitCost
      const differs =
        piecesPerBox !== item.piecesPerUnit || Math.abs(unitCost - item.unitCost) > PRICE_TOLERANCE
      if (differs && deliveredItem.differenceReason.length < 5)
        throw new Error(
          `Batch ${deliveredItem.batchNumber}: the box size or invoice cost differs from the order. Enter the reason (at least 5 characters).`
        )
      const boxSellPrice = deliveredItem.boxSellPrice ?? null
      if (boxSellPrice !== null && piecesPerBox <= 1)
        throw new Error(
          `Batch ${deliveredItem.batchNumber}: a box price needs boxes of more than one piece.`
        )
      // Note: Stock and batch prices are per piece; a box line converts here.
      const receivedPieces = deliveredItem.receivedQuantity * piecesPerBox
      const buyPrice = unitCost / piecesPerBox
      const sellPrice = deliveredItem.sellPrice!
      // Note: Compare like with like: piece price to cost per piece, box price to cost per box.
      if (sellPrice < buyPrice - PRICE_TOLERANCE) {
        throw new Error(
          `Batch ${deliveredItem.batchNumber}: the selling price cannot be lower than the unit cost of ₱${buyPrice.toFixed(2)} per piece.`
        )
      }
      if (boxSellPrice !== null && boxSellPrice < unitCost - PRICE_TOLERANCE) {
        throw new Error(
          `Batch ${deliveredItem.batchNumber}: the box price cannot be lower than the cost of ₱${unitCost.toFixed(2)} per box.`
        )
      }
      const wholesalePrice = deliveredItem.wholesaleBoxPrice ?? null
      if (wholesalePrice !== null && wholesalePrice < unitCost - PRICE_TOLERANCE) {
        throw new Error(
          `Batch ${deliveredItem.batchNumber}: the wholesale price cannot be lower than the cost of ₱${unitCost.toFixed(2)} per box.`
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
          existingBatch.piecesPerBox !== piecesPerBox && 'box size',
          existingBatch.sellPrice !== sellPrice && 'selling price',
          (existingBatch.boxSellPrice ?? null) !== boxSellPrice && 'box price',
          (existingBatch.wholesaleBoxPrice ?? null) !== wholesalePrice && 'wholesale price',
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
            sellPrice,
            boxSellPrice,
            wholesaleBoxPrice: wholesalePrice,
            piecesPerBox,
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
          quantity: deliveredItem.receivedQuantity,
          unitCost,
          piecesPerUnit: piecesPerBox,
          differenceReason: differs ? deliveredItem.differenceReason : null
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
