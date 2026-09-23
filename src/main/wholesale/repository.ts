import { db } from '@main/db'
import { deductBatchStock } from '@main/inventory/repository'
import { isBatchSellable, localDate } from '@shared/inventory'
import { calculateSale, priceToCents, type SaleLine } from '@shared/sales'
import type { Database } from '@shared/types'
import {
  receivable,
  WholesaleError,
  wholesaleListSchema,
  wholesaleOrderSchema,
  wholesalePaymentSchema,
  wholesaleScheduleSchema,
  type WholesaleDetails,
  type WholesaleDraft,
  type WholesaleFilter,
  type WholesalePaymentInput,
  type WholesaleSchedule,
  type WholesaleSummary
} from '@shared/wholesale'
import { sql, type Kysely } from 'kysely'
import { randomUUID } from 'node:crypto'

const paidSql = sql<number>`COALESCE((SELECT SUM(amount_cents) FROM wholesale_payments WHERE order_id = wholesale_orders.id), 0)`
export async function listOrders(
  input: WholesaleFilter,
  financial: boolean
): Promise<WholesaleSummary[]> {
  const filter = wholesaleListSchema.parse(input)
  let query = db
    .selectFrom('wholesaleOrders')
    .selectAll()
    .select(paidSql.as('paidCents'))
    .orderBy('id', 'desc')
    .limit(50)
  if (filter.beforeId) query = query.where('id', '<', filter.beforeId)
  if (filter.status) query = query.where('status', '=', filter.status)
  if (filter.search)
    query = query.where((eb) =>
      eb.or([
        eb('reference', 'like', `%${filter.search}%`),
        eb('customerName', 'like', `%${filter.search}%`)
      ])
    )
  if (filter.overdue) {
    if (!financial) throw new WholesaleError('Administrator access is required for receivables.')
    query = query
      .where('status', '!=', 'cancelled')
      .where('dueDate', '<', localDate())
      .where('totalCents', '>', paidSql)
  }
  return (await query.execute()).map(({ requestFingerprint, paidCents, ...order }) => {
    void requestFingerprint
    return {
      ...order,
      ...(financial && order.status !== 'cancelled'
        ? { receivable: receivable(order.totalCents, paidCents, order.dueDate) }
        : {})
    }
  })
}
export async function getOrder(id: number, financial: boolean): Promise<WholesaleDetails> {
  const order = await db
    .selectFrom('wholesaleOrders')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  if (!order) throw new WholesaleError('Wholesale order not found.')
  const { requestFingerprint, ...summary } = order
  void requestFingerprint
  const items = await db
    .selectFrom('wholesaleOrderItems')
    .selectAll()
    .where('orderId', '=', id)
    .orderBy('id')
    .execute()
  if (!financial) return { ...summary, items }
  const payments = await db
    .selectFrom('wholesalePayments')
    .selectAll()
    .where('orderId', '=', id)
    .orderBy('id', 'desc')
    .execute()
  return {
    ...summary,
    items,
    payments,
    ...(order.status !== 'cancelled'
      ? {
          receivable: receivable(
            order.totalCents,
            payments.reduce((sum, p) => sum + p.amountCents, 0),
            order.dueDate
          )
        }
      : {})
  }
}
export async function overdueSummary(): Promise<{ count: number; remainingCents: number }> {
  const row = await db
    .selectFrom('wholesaleOrders')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .select(sql<number>`COALESCE(SUM(total_cents - ${paidSql}), 0)`.as('remainingCents'))
    .where('status', '!=', 'cancelled')
    .where('dueDate', '<', localDate())
    .where('totalCents', '>', paidSql)
    .executeTakeFirstOrThrow()
  return { count: Number(row.count), remainingCents: Number(row.remainingCents) }
}
async function activeAccount(
  database: Kysely<Database>,
  accountId: number,
  adminOnly = false
): Promise<string> {
  const account = await database
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', accountId)
    .executeTakeFirst()
  if (
    !account ||
    account.isArchived ||
    !account.isVerified ||
    !['master', ...(adminOnly ? [] : ['staff'])].includes(account.role)
  )
    throw new WholesaleError('Your account is not permitted to perform this operation.')
  return account.fullName
}
export async function createOrder(input: WholesaleDraft, accountId: number): Promise<number> {
  const data = wholesaleOrderSchema.parse(input)
  const { requestId, ...values } = data
  const fingerprint = JSON.stringify(values)
  return db.transaction().execute(async (transaction) => {
    await activeAccount(transaction, accountId)
    const existing = await transaction
      .selectFrom('wholesaleOrders')
      .selectAll()
      .where('requestId', '=', requestId)
      .executeTakeFirst()
    if (existing) {
      if (existing.createdBy !== accountId || existing.requestFingerprint !== fingerprint)
        throw new WholesaleError('Order request reference already belongs to another order.')
      return existing.id
    }
    const customer = await transaction
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', data.customerId)
      .executeTakeFirst()
    if (!customer) throw new WholesaleError('Select an existing customer.')
    const batches = await transaction
      .selectFrom('batches')
      .innerJoin('drugs', 'drugs.id', 'batches.drugId')
      .select([
        'batches.id',
        'batches.drugId',
        'batches.physicalTag',
        'batches.expiresAt',
        'batches.currentStock',
        'batches.sellPrice',
        'drugs.brandName',
        'drugs.genericName',
        'drugs.formulation',
        'drugs.category',
        'drugs.isArchived'
      ])
      .where(
        'batches.id',
        'in',
        data.items.map((item) => item.batchId)
      )
      .execute()
    const items: SaleLine[] = data.items.map((item) => {
      const batch = batches.find((value) => value.id === item.batchId)
      if (
        !batch ||
        batch.isArchived ||
        !isBatchSellable(batch.currentStock, String(batch.expiresAt))
      )
        throw new WholesaleError('Select an active product with valid, available stock.')
      if (priceToCents(batch.sellPrice) !== item.unitPriceCents)
        throw new WholesaleError('Product price changed. Refresh and re-add the batch.')
      return {
        ...item,
        drugId: batch.drugId,
        productName: `${batch.brandName} (${batch.genericName}) ${batch.formulation}`,
        category: batch.category,
        batchNumber: batch.physicalTag ?? `Batch ${batch.id}`,
        expiresAt: String(batch.expiresAt)
      }
    })
    const totalCents = calculateSale(items, 'none').totalCents
    const order = await transaction
      .insertInto('wholesaleOrders')
      .values({
        requestId,
        requestFingerprint: fingerprint,
        reference: `WHO-${randomUUID().toUpperCase()}`,
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        createdBy: accountId,
        createdAt: new Date().toISOString(),
        orderDate: localDate(),
        dueDate: data.dueDate,
        totalCents,
        status: 'pending',
        notes: data.notes,
        deliveryAddress: data.deliveryAddress,
        deliveryNotes: '',
        scheduledDate: null,
        deliveredAt: null,
        deliveredByName: null
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await transaction
      .insertInto('wholesaleOrderItems')
      .values(items.map((item) => ({ ...item, orderId: order.id })))
      .execute()
    return order.id
  })
}
export async function scheduleOrder(input: WholesaleSchedule, accountId: number): Promise<void> {
  const data = wholesaleScheduleSchema.parse(input)
  await db.transaction().execute(async (transaction) => {
    await activeAccount(transaction, accountId)
    const order = await transaction
      .selectFrom('wholesaleOrders')
      .selectAll()
      .where('id', '=', data.orderId)
      .executeTakeFirst()
    if (!order || !['pending', 'scheduled'].includes(order.status))
      throw new WholesaleError('Only pending or scheduled orders can be rescheduled.')
    if (data.scheduledDate < order.orderDate)
      throw new WholesaleError('Delivery schedule cannot precede the order date.')
    await transaction
      .updateTable('wholesaleOrders')
      .set({
        scheduledDate: data.scheduledDate,
        deliveryAddress: data.deliveryAddress,
        deliveryNotes: data.deliveryNotes,
        status: 'scheduled'
      })
      .where('id', '=', order.id)
      .executeTakeFirstOrThrow()
  })
}
export async function deliverOrder(id: number, accountId: number): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const name = await activeAccount(transaction, accountId)
    const order = await transaction
      .selectFrom('wholesaleOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    if (!order || order.status !== 'scheduled')
      throw new WholesaleError('Only a scheduled, undelivered order can be fulfilled.')
    const items = await transaction
      .selectFrom('wholesaleOrderItems')
      .selectAll()
      .where('orderId', '=', id)
      .execute()
    if (!items.length) throw new WholesaleError('This order has no items.')
    for (const item of items) {
      const batch = await transaction
        .selectFrom('batches')
        .innerJoin('drugs', 'drugs.id', 'batches.drugId')
        .select([
          'batches.currentStock',
          'batches.expiresAt',
          'batches.physicalTag',
          'drugs.isArchived',
          'drugs.id'
        ])
        .where('batches.id', '=', item.batchId)
        .executeTakeFirst()
      if (
        !batch ||
        batch.id !== item.drugId ||
        batch.isArchived ||
        !isBatchSellable(batch.currentStock, String(batch.expiresAt))
      )
        throw new WholesaleError(`${item.productName}: batch is unavailable or expired.`)
      if (item.quantity > batch.currentStock)
        throw new WholesaleError(
          `${item.productName}: insufficient stock. No delivery was recorded.`
        )
      await deductBatchStock(
        transaction,
        { batchId: item.batchId, quantity: item.quantity, reason: `Wholesale ${order.reference}` },
        accountId
      )
      await transaction
        .updateTable('wholesaleOrderItems')
        .set({
          expiresAt: String(batch.expiresAt),
          batchNumber: batch.physicalTag ?? `Batch ${item.batchId}`
        })
        .where('id', '=', item.id)
        .execute()
    }
    const result = await transaction
      .updateTable('wholesaleOrders')
      .set({ status: 'delivered', deliveredAt: new Date().toISOString(), deliveredByName: name })
      .where('id', '=', id)
      .where('status', '=', 'scheduled')
      .executeTakeFirstOrThrow()
    if (Number(result.numUpdatedRows) !== 1)
      throw new WholesaleError('Delivery status changed. Reload the order.')
  })
}
export async function cancelOrder(id: number, accountId: number): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await activeAccount(transaction, accountId)
    const order = await transaction
      .selectFrom('wholesaleOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    if (!order || !['pending', 'scheduled'].includes(order.status))
      throw new WholesaleError('Only undelivered orders can be cancelled.')
    const payment = await transaction
      .selectFrom('wholesalePayments')
      .select('id')
      .where('orderId', '=', id)
      .executeTakeFirst()
    if (payment) throw new WholesaleError('An order with recorded payments cannot be cancelled.')
    await transaction
      .updateTable('wholesaleOrders')
      .set({ status: 'cancelled' })
      .where('id', '=', id)
      .execute()
  })
}
export async function recordPayment(
  input: WholesalePaymentInput,
  accountId: number
): Promise<void> {
  const { paymentId, ...data } = wholesalePaymentSchema.parse(input)
  await db.transaction().execute(async (transaction) => {
    await activeAccount(transaction, accountId, true)
    const order = await transaction
      .selectFrom('wholesaleOrders')
      .selectAll()
      .where('id', '=', data.orderId)
      .executeTakeFirst()
    if (!order || order.status === 'cancelled')
      throw new WholesaleError('Select an active wholesale order.')
    if (data.paidAt < order.orderDate)
      throw new WholesaleError('Payment cannot precede the order date.')
    const existing =
      paymentId === undefined
        ? undefined
        : await transaction
            .selectFrom('wholesalePayments')
            .selectAll()
            .where('id', '=', paymentId)
            .where('orderId', '=', order.id)
            .executeTakeFirst()
    if (paymentId !== undefined && !existing)
      throw new WholesaleError('Payment does not belong to this order.')
    const duplicate = await transaction
      .selectFrom('wholesalePayments')
      .select('id')
      .where('reference', '=', data.reference)
      .executeTakeFirst()
    if (duplicate && duplicate.id !== paymentId)
      throw new WholesaleError('That payment reference has already been recorded.')
    const paid = await transaction
      .selectFrom('wholesalePayments')
      .select((eb) => eb.fn.sum<number>('amountCents').as('total'))
      .where('orderId', '=', order.id)
      .executeTakeFirstOrThrow()
    if (
      data.amountCents >
      order.totalCents - Number(paid.total ?? 0) + (existing?.amountCents ?? 0)
    )
      throw new WholesaleError('Payment exceeds the remaining order balance.')
    const updatedAt = new Date().toISOString()
    if (existing) {
      await transaction
        .updateTable('wholesalePayments')
        .set({ ...data, updatedAt, updatedBy: accountId })
        .where('id', '=', existing.id)
        .execute()
      return
    }
    await transaction
      .insertInto('wholesalePayments')
      .values({
        ...data,
        recordedBy: accountId,
        createdAt: updatedAt,
        updatedAt,
        updatedBy: accountId
      })
      .execute()
  })
}
