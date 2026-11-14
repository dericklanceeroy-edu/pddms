import { db } from '@main/db'
import { deductBatchStock } from '@main/inventory/repository'
import { isBatchSellable } from '@shared/inventory'
import {
  calculateSale,
  checkoutSchema,
  priceToCents,
  saleDiscount,
  saleDraftSchema,
  SalesError,
  type Checkout,
  type SaleDraft,
  type SaleLine,
  type SaleRecord,
  type SaleTotals
} from '@shared/sales'
import type { Database } from '@shared/types'
import { saleUnitPieces, UnitError, unitSellPrice } from '@shared/units'
import type { Kysely } from 'kysely'
import { randomUUID } from 'node:crypto'

type ParsedSaleDraft = ReturnType<typeof saleDraftSchema.parse>

async function prepare(
  database: Kysely<Database>,
  draft: ParsedSaleDraft
): Promise<{
  items: SaleLine[]
  totals: SaleTotals
  customerName: string
  discountId: string | null
  discountExpiresAt: string | null
}> {
  const customer =
    draft.customerId === null
      ? null
      : await database
          .selectFrom('customers')
          .selectAll()
          .where('id', '=', draft.customerId)
          .executeTakeFirst()
  if (draft.customerId !== null && !customer)
    throw new SalesError('Customer not found. Select a current customer.')
  const walkIn = draft.walkInDiscount
  const discount = saleDiscount(customer ?? null, walkIn)
  const batches = await database
    .selectFrom('batches')
    .innerJoin('drugs', 'drugs.id', 'batches.drugId')
    .select([
      'batches.id',
      'batches.drugId',
      'batches.currentStock',
      'batches.sellPrice',
      'batches.boxSellPrice',
      'batches.physicalTag',
      'batches.expiresAt',
      'drugs.brandName',
      'drugs.genericName',
      'drugs.formulation',
      'drugs.category',
      'drugs.piecesPerBox',
      'drugs.isArchived'
    ])
    .where(
      'batches.id',
      'in',
      draft.items.map((item) => item.batchId)
    )
    .execute()
  const items = draft.items.map((item): SaleLine => {
    const batch = batches.find((value) => value.id === item.batchId)
    if (!batch || batch.isArchived)
      throw new SalesError('Product or batch is no longer available. Refresh the catalog.')
    if (!isBatchSellable(batch.currentStock, String(batch.expiresAt)))
      throw new SalesError(`${batch.brandName}: batch is expired, invalid, or out of stock.`)
    let pieces: number
    let unitPrice: number
    try {
      pieces = saleUnitPieces(item.unit, batch.piecesPerBox)
      unitPrice = unitSellPrice(item.unit, batch.sellPrice, batch.boxSellPrice, batch.piecesPerBox)
    } catch (error) {
      if (error instanceof UnitError) throw new SalesError(`${batch.brandName}: ${error.message}`)
      throw error
    }
    if (item.quantity * pieces > batch.currentStock)
      throw new SalesError(`${batch.brandName}: insufficient batch stock.`)
    const unitPriceCents = priceToCents(unitPrice)
    if (item.unitPriceCents !== unitPriceCents)
      throw new SalesError('A price changed. Refresh the catalog and re-add the item.')
    return {
      ...item,
      unitPriceCents,
      piecesPerUnit: pieces,
      drugId: batch.drugId,
      productName: `${batch.brandName} (${batch.genericName}) ${batch.formulation}`,
      category: batch.category,
      batchNumber: batch.physicalTag ?? `Batch ${batch.id}`,
      expiresAt: String(batch.expiresAt)
    }
  })
  return {
    items,
    totals: calculateSale(items, discount),
    customerName: walkIn?.holderName ?? customer?.fullName ?? 'Walk-in customer',
    discountId: discount === 'none' ? null : walkIn ? walkIn.discountId : customer!.discountId,
    discountExpiresAt:
      discount === 'none' ? null : walkIn ? walkIn.discountExpiresAt : customer!.discountExpiresAt
  }
}

export async function quote(draft: SaleDraft): Promise<SaleTotals> {
  return (await prepare(db, saleDraftSchema.parse(draft))).totals
}

export async function getSale(id: number, cashierId?: number): Promise<SaleRecord> {
  let query = db.selectFrom('sales').selectAll().where('id', '=', id)
  if (cashierId !== undefined) query = query.where('cashierId', '=', cashierId)
  const sale = await query.executeTakeFirst()
  if (!sale) throw new SalesError('Transaction not found or access denied.')
  const items = await db
    .selectFrom('saleItems')
    .selectAll()
    .where('saleId', '=', id)
    .orderBy('id')
    .execute()
  return { ...sale, items }
}

export async function history(
  beforeId?: number,
  cashierId?: number
): Promise<Omit<SaleRecord, 'items'>[]> {
  let query = db.selectFrom('sales').selectAll().orderBy('id', 'desc').limit(50)
  if (beforeId !== undefined) query = query.where('id', '<', beforeId)
  if (cashierId !== undefined) query = query.where('cashierId', '=', cashierId)
  return query.execute()
}

export async function checkout(input: Checkout, accountId: number): Promise<SaleRecord> {
  const data = checkoutSchema.parse(input)
  const id = await db.transaction().execute(async (transaction) => {
    const account = await transaction
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', accountId)
      .executeTakeFirst()
    if (!account || account.isArchived || !account.isVerified)
      throw new SalesError('Your account is not permitted to complete sales.')
    const existing = await transaction
      .selectFrom('sales')
      .selectAll()
      .where('requestId', '=', data.requestId)
      .executeTakeFirst()
    if (existing) {
      if (existing.cashierId !== accountId)
        throw new SalesError('This checkout reference is already in use.')
      const lines = await transaction
        .selectFrom('saleItems')
        .selectAll()
        .where('saleId', '=', existing.id)
        .execute()
      if (
        existing.customerId !== data.customerId ||
        (data.walkInDiscount
          ? existing.discountType !== data.walkInDiscount.discountType ||
            existing.discountId !== data.walkInDiscount.discountId.trim() ||
            existing.customerName !== data.walkInDiscount.holderName.trim()
          : existing.customerId === null && existing.discountType !== 'none') ||
        existing.cashCents !== data.cashCents ||
        existing.totalCents !== data.expectedTotalCents ||
        lines.length !== data.items.length ||
        !lines.every((line) =>
          data.items.some(
            (item) =>
              item.batchId === line.batchId &&
              item.quantity === line.quantity &&
              (item.unit ?? 'piece') === line.unit &&
              item.unitPriceCents === line.unitPriceCents
          )
        )
      )
        throw new SalesError('Checkout reference belongs to a different transaction.')
      return existing.id
    }
    const prepared = await prepare(transaction, {
      customerId: data.customerId,
      walkInDiscount: data.walkInDiscount,
      items: data.items
    })
    if (prepared.totals.totalCents !== data.expectedTotalCents)
      throw new SalesError(
        'The total or customer eligibility changed. Review the updated total before paying.'
      )
    if (data.cashCents < prepared.totals.totalCents)
      throw new SalesError('Cash received is less than the total due.')
    const reference = `SALE-${randomUUID().toUpperCase()}`
    const sale = await transaction
      .insertInto('sales')
      .values({
        requestId: data.requestId,
        reference,
        cashierId: accountId,
        cashierName: account.fullName,
        customerId: data.customerId,
        customerName: prepared.customerName,
        discountId: prepared.discountId,
        discountExpiresAt: prepared.discountExpiresAt,
        ...prepared.totals,
        cashCents: data.cashCents,
        changeCents: data.cashCents - prepared.totals.totalCents,
        createdAt: new Date().toISOString()
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    for (const item of prepared.items) {
      await deductBatchStock(
        transaction,
        {
          batchId: item.batchId,
          quantity: item.quantity * item.piecesPerUnit,
          reason: `Sale ${reference}`
        },
        accountId
      )
      await transaction
        .insertInto('saleItems')
        .values({ ...item, saleId: sale.id })
        .executeTakeFirstOrThrow()
    }
    return sale.id
  })
  return getSale(id, accountId)
}
