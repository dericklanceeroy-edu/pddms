import { db } from '@main/db'
import type { Drug, NewProduct, Product } from '@shared/types'

export interface ProductWithInventory extends Product {
  batches: Array<{
    id: number
    batchNumber: string
    supplier: string
    stock: number
    sellPrice: number
    expiresAt: Date
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

  return products.map((product) => ({
    ...toProduct(product),
    batches: batches
      .filter((batch) => batch.drugId === product.id)
      .map((batch) => ({
        id: batch.id,
        batchNumber: batch.physicalTag ?? `Batch ${batch.id}`,
        supplier: batch.organization,
        stock: batch.currentStock,
        sellPrice: batch.sellPrice,
        expiresAt: batch.expiresAt
      }))
  }))
}

const toProduct = (drug: Drug): Product => ({
  ...drug,
  isPrescribed: drug.isPrescribed === 1,
  isControlled: drug.isControlled === 1
})

export async function insertOne(data: NewProduct): Promise<Product> {
  const drug = await db
    .insertInto('drugs')
    .values({
      ...data,
      isPrescribed: data.isPrescribed ? 1 : 0,
      isControlled: data.isControlled ? 1 : 0
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return toProduct(drug)
}

export async function removeOneById(id: number): Promise<void> {
  await db
    .updateTable('drugs')
    .set({ isArchived: 1 })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
