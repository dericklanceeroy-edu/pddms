import { db } from '@main/db'
import type { Drug, DrugUpdate, NewProduct, Product, ProductUpdate } from '@shared/types'
import { sql } from 'kysely'

export interface ProductWithInventory extends Product {
  batches: Array<{
    id: number
    batchNumber: string
    supplier: string
    stock: number
    sellPrice: number
    expiresAt: Date
    receipts: Array<{ orderNumber: string; deliveredAt: string; quantity: number }>
  }>
}

export async function findAll(): Promise<ProductWithInventory[]> {
  const products = await db
    .selectFrom('drugs')
    .selectAll()
    .where('isArchived', '=', 0)
    .orderBy('brandName')
    .execute()
  const batches = await db
    .selectFrom('batches')
    .innerJoin('suppliers', 'suppliers.id', 'batches.supplierId')
    .select([
      'batches.id',
      'batches.drugId',
      'batches.physicalTag',
      'batches.currentStock',
      'batches.sellPrice',
      'batches.expiresAt',
      'suppliers.organization'
    ])
    .execute()

  const receipts = await db
    .selectFrom('supplierDeliveryItems')
    .innerJoin('supplierDeliveries', 'supplierDeliveries.id', 'supplierDeliveryItems.deliveryId')
    .innerJoin('purchaseOrders', 'purchaseOrders.id', 'supplierDeliveries.purchaseOrderId')
    .select([
      'supplierDeliveryItems.batchId',
      'supplierDeliveryItems.quantity',
      'purchaseOrders.orderNumber',
      'supplierDeliveries.deliveredAt'
    ])
    .orderBy('supplierDeliveries.deliveredAt', 'desc')
    .execute()
  const batchesByProduct = new Map<number, typeof batches>()
  const receiptsByBatch = new Map<number, typeof receipts>()
  for (const batch of batches) {
    const productBatches = batchesByProduct.get(batch.drugId) ?? []
    productBatches.push(batch)
    batchesByProduct.set(batch.drugId, productBatches)
  }
  for (const receipt of receipts) {
    const batchReceipts = receiptsByBatch.get(receipt.batchId) ?? []
    batchReceipts.push(receipt)
    receiptsByBatch.set(receipt.batchId, batchReceipts)
  }

  return products.map((product) => ({
    ...toProduct(product),
    batches: (batchesByProduct.get(product.id) ?? []).map((batch) => ({
        id: batch.id,
        batchNumber: batch.physicalTag ?? `Batch ${batch.id}`,
        supplier: batch.organization,
        stock: batch.currentStock,
        sellPrice: batch.sellPrice,
        expiresAt: batch.expiresAt,
        receipts: (receiptsByBatch.get(batch.id) ?? [])
          .map(({ orderNumber, deliveredAt, quantity }) => ({ orderNumber, deliveredAt, quantity }))
      }))
  }))
}

const toProduct = (drug: Drug): Product => ({
  ...drug,
  isPrescribed: drug.isPrescribed === 1,
  isControlled: drug.isControlled === 1
})

export async function insertOne(data: NewProduct): Promise<Product> {
  return db.transaction().execute(async (transaction) => {
    const duplicate = await transaction
      .selectFrom('drugs')
      .select('id')
      .where('isArchived', '=', 0)
      .where(sql<string>`lower(trim(brand_name))`, '=', data.brandName.trim().toLowerCase())
      .where(sql<string>`lower(trim(formulation))`, '=', data.formulation.trim().toLowerCase())
      .executeTakeFirst()
    if (duplicate) throw new Error('A product with this brand and formulation already exists.')
    const drug = await transaction
      .insertInto('drugs')
      .values({
        ...data,
        isPrescribed: data.isPrescribed ? 1 : 0,
        isControlled: data.isControlled ? 1 : 0
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    return toProduct(drug)
  })
}

export async function updateOneById(id: number, data: ProductUpdate): Promise<Product> {
  return db.transaction().execute(async (transaction) => {
    const current = await transaction
      .selectFrom('drugs')
      .selectAll()
      .where('id', '=', id)
      .where('isArchived', '=', 0)
      .executeTakeFirst()
    if (!current) throw new Error('Product not found.')
    const duplicate = await transaction
      .selectFrom('drugs')
      .select('id')
      .where('id', '!=', id)
      .where('isArchived', '=', 0)
      .where(
        sql<string>`lower(trim(brand_name))`,
        '=',
        (data.brandName ?? current.brandName).trim().toLowerCase()
      )
      .where(
        sql<string>`lower(trim(formulation))`,
        '=',
        (data.formulation ?? current.formulation).trim().toLowerCase()
      )
      .executeTakeFirst()
    if (duplicate) throw new Error('A product with this brand and formulation already exists.')
    const { isPrescribed, isControlled, ...details } = data
    const values: DrugUpdate = { ...details }
    if (isPrescribed !== undefined) values.isPrescribed = isPrescribed ? 1 : 0
    if (isControlled !== undefined) values.isControlled = isControlled ? 1 : 0
    const drug = await transaction
      .updateTable('drugs')
      .set(values)
      .where('id', '=', id)
      .where('isArchived', '=', 0)
      .returningAll()
      .executeTakeFirstOrThrow()
    return toProduct(drug)
  })
}

export async function removeOneById(id: number): Promise<void> {
  await db
    .updateTable('drugs')
    .set({ isArchived: 1 })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
