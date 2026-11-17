import { noteAudit } from '@main/audit/repository'
import { db } from '@main/db'
import {
  newPackSchema,
  packPriceSchema,
  type NewPack,
  type PackPrice,
  type PackPriceRecord,
  type PriceDifferenceRecord,
  type SupplierPackRecord
} from '@shared/controls'
import { localDate } from '@shared/inventory'
import type { Database } from '@shared/types'
import type { Kysely } from 'kysely'

/**
 * Supplier price list. The owner records each supplier's quoted cost per box for every pack size
 * the supplier sells. Every price is kept with the date it takes effect, so a purchase order uses
 * the price in effect on its order date and older prices stay on record.
 */

const peso = (value: number): string => `₱${value.toFixed(2)}`

export async function findPriceList(): Promise<SupplierPackRecord[]> {
  const packs = await db
    .selectFrom('supplierPacks')
    .innerJoin('suppliers', 'suppliers.id', 'supplierPacks.supplierId')
    .innerJoin('drugs', 'drugs.id', 'supplierPacks.drugId')
    .select([
      'supplierPacks.id',
      'supplierPacks.supplierId',
      'supplierPacks.drugId',
      'supplierPacks.piecesPerBox',
      'supplierPacks.isArchived',
      'suppliers.organization as supplierName',
      'drugs.brandName',
      'drugs.genericName',
      'drugs.formulation',
      'drugs.isArchived as productArchived'
    ])
    .orderBy('suppliers.organization')
    .orderBy('drugs.brandName')
    .orderBy('supplierPacks.piecesPerBox')
    .execute()
  const prices = await db
    .selectFrom('supplierPackPrices')
    .leftJoin('accounts', 'accounts.id', 'supplierPackPrices.recordedBy')
    .select([
      'supplierPackPrices.id',
      'supplierPackPrices.packId',
      'supplierPackPrices.unitCost',
      'supplierPackPrices.effectiveFrom',
      'supplierPackPrices.quotationReference',
      'supplierPackPrices.createdAt',
      'accounts.fullName as recordedByName'
    ])
    .orderBy('supplierPackPrices.effectiveFrom', 'desc')
    .orderBy('supplierPackPrices.id', 'desc')
    .execute()
  const today = localDate()
  return packs.map((pack) => {
    const history: PackPriceRecord[] = prices
      .filter((price) => price.packId === pack.id)
      .map(({ packId, ...price }) => {
        void packId
        return price
      })
    return {
      id: pack.id,
      supplierId: pack.supplierId,
      supplierName: pack.supplierName,
      drugId: pack.drugId,
      productName: `${pack.brandName} (${pack.genericName}) ${pack.formulation}`,
      piecesPerBox: pack.piecesPerBox,
      isArchived: pack.isArchived === 1 || pack.productArchived === 1,
      current: history.find((price) => price.effectiveFrom <= today) ?? null,
      upcoming: history.filter((price) => price.effectiveFrom > today).at(-1) ?? null,
      history
    }
  })
}

/** Cost per box in effect on the given date, or null when the pack has no price yet. */
export async function priceOn(
  database: Kysely<Database>,
  packId: number,
  date = localDate()
): Promise<number | null> {
  const price = await database
    .selectFrom('supplierPackPrices')
    .select('unitCost')
    .where('packId', '=', packId)
    .where('effectiveFrom', '<=', date)
    .orderBy('effectiveFrom', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst()
  return price?.unitCost ?? null
}

export async function createPack(input: NewPack, accountId: number | null): Promise<number> {
  const data = newPackSchema.parse(input)
  return db.transaction().execute(async (transaction) => {
    const supplier = await transaction
      .selectFrom('suppliers')
      .select('organization')
      .where('id', '=', data.supplierId)
      .executeTakeFirst()
    if (!supplier) throw new Error('Supplier not found.')
    const product = await transaction
      .selectFrom('drugs')
      .select(['brandName', 'isArchived'])
      .where('id', '=', data.drugId)
      .executeTakeFirst()
    if (!product || product.isArchived) throw new Error('Product not found or archived.')
    const existing = await transaction
      .selectFrom('supplierPacks')
      .select(['id', 'isArchived'])
      .where('supplierId', '=', data.supplierId)
      .where('drugId', '=', data.drugId)
      .where('piecesPerBox', '=', data.piecesPerBox)
      .executeTakeFirst()
    if (existing && !existing.isArchived)
      throw new Error(
        `${supplier.organization} already has a box of ${data.piecesPerBox} for ${product.brandName}. Change its price instead.`
      )
    let packId: number
    if (existing) {
      await transaction
        .updateTable('supplierPacks')
        .set({ isArchived: 0 })
        .where('id', '=', existing.id)
        .execute()
      packId = existing.id
    } else
      packId = (
        await transaction
          .insertInto('supplierPacks')
          .values({
            supplierId: data.supplierId,
            drugId: data.drugId,
            piecesPerBox: data.piecesPerBox
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id
    await transaction
      .insertInto('supplierPackPrices')
      .values({
        packId,
        unitCost: data.unitCost,
        effectiveFrom: data.effectiveFrom,
        quotationReference: data.quotationReference,
        recordedBy: accountId
      })
      .execute()
    noteAudit({
      summary: `${supplier.organization}: ${product.brandName}, box of ${data.piecesPerBox} at ${peso(data.unitCost)} from ${data.effectiveFrom}`,
      changes: [{ field: 'Cost per box', from: null, to: data.unitCost }]
    })
    return packId
  })
}

export async function setPackPrice(input: PackPrice, accountId: number | null): Promise<void> {
  const data = packPriceSchema.parse(input)
  await db.transaction().execute(async (transaction) => {
    const pack = await transaction
      .selectFrom('supplierPacks')
      .innerJoin('suppliers', 'suppliers.id', 'supplierPacks.supplierId')
      .innerJoin('drugs', 'drugs.id', 'supplierPacks.drugId')
      .select([
        'supplierPacks.id',
        'supplierPacks.piecesPerBox',
        'supplierPacks.isArchived',
        'suppliers.organization',
        'drugs.brandName'
      ])
      .where('supplierPacks.id', '=', data.packId)
      .executeTakeFirst()
    if (!pack) throw new Error('Pack not found.')
    if (pack.isArchived) throw new Error('This pack is archived. Restore it first.')
    const before = await priceOn(transaction, pack.id, data.effectiveFrom)
    await transaction
      .insertInto('supplierPackPrices')
      .values({
        packId: pack.id,
        unitCost: data.unitCost,
        effectiveFrom: data.effectiveFrom,
        quotationReference: data.quotationReference,
        recordedBy: accountId
      })
      .execute()
    noteAudit({
      summary: `${pack.organization}: ${pack.brandName}, box of ${pack.piecesPerBox}, price from ${data.effectiveFrom}${data.quotationReference ? ` (quotation ${data.quotationReference})` : ''}`,
      changes: [{ field: 'Cost per box', from: before, to: data.unitCost }]
    })
  })
}

export async function setPackArchived(packId: number, archived: boolean): Promise<void> {
  const pack = await db
    .selectFrom('supplierPacks')
    .innerJoin('suppliers', 'suppliers.id', 'supplierPacks.supplierId')
    .innerJoin('drugs', 'drugs.id', 'supplierPacks.drugId')
    .select([
      'supplierPacks.isArchived',
      'suppliers.organization',
      'drugs.brandName',
      'supplierPacks.piecesPerBox'
    ])
    .where('supplierPacks.id', '=', packId)
    .executeTakeFirst()
  if (!pack) throw new Error('Pack not found.')
  await db
    .updateTable('supplierPacks')
    .set({ isArchived: archived ? 1 : 0 })
    .where('id', '=', packId)
    .execute()
  noteAudit({
    summary: `${pack.organization}: ${pack.brandName}, box of ${pack.piecesPerBox} ${archived ? 'archived (no longer offered)' : 'restored'}`,
    changes: [{ field: 'Archived', from: pack.isArchived === 1, to: archived }]
  })
}

/** Deliveries whose invoice cost or box size differed from the order, newest first. */
export async function findPriceDifferences(): Promise<PriceDifferenceRecord[]> {
  const rows = await db
    .selectFrom('supplierDeliveryItems')
    .innerJoin('supplierDeliveries', 'supplierDeliveries.id', 'supplierDeliveryItems.deliveryId')
    .innerJoin(
      'purchaseOrderItems',
      'purchaseOrderItems.id',
      'supplierDeliveryItems.purchaseOrderItemId'
    )
    .innerJoin('purchaseOrders', 'purchaseOrders.id', 'supplierDeliveries.purchaseOrderId')
    .innerJoin('suppliers', 'suppliers.id', 'supplierDeliveries.supplierId')
    .innerJoin('drugs', 'drugs.id', 'supplierDeliveryItems.drugId')
    .innerJoin('accounts', 'accounts.id', 'supplierDeliveries.recordedBy')
    .select([
      'supplierDeliveryItems.id',
      'supplierDeliveries.deliveredAt',
      'purchaseOrders.orderNumber',
      'suppliers.id as supplierId',
      'suppliers.organization as supplierName',
      'drugs.id as drugId',
      'drugs.brandName',
      'drugs.genericName',
      'drugs.formulation',
      'purchaseOrderItems.unitCost as orderedUnitCost',
      'supplierDeliveryItems.unitCost as invoiceUnitCost',
      'purchaseOrderItems.piecesPerUnit as orderedPiecesPerBox',
      'supplierDeliveryItems.piecesPerUnit as deliveredPiecesPerBox',
      'supplierDeliveryItems.differenceReason as reason',
      'accounts.fullName as recordedByName'
    ])
    .where((eb) =>
      eb.or([
        eb('supplierDeliveryItems.unitCost', '!=', eb.ref('purchaseOrderItems.unitCost')),
        eb('supplierDeliveryItems.piecesPerUnit', '!=', eb.ref('purchaseOrderItems.piecesPerUnit'))
      ])
    )
    .orderBy('supplierDeliveries.deliveredAt', 'desc')
    .orderBy('supplierDeliveryItems.id', 'desc')
    .limit(200)
    .execute()
  // Note: The name matches the price list's product name (with formulation), and the ids let the
  // Price List find the pack to update, so a price-only difference offers "Update Price".
  return rows.map(({ brandName, genericName, formulation, ...row }) => ({
    ...row,
    productName: `${brandName} (${genericName}) ${formulation}`
  }))
}
