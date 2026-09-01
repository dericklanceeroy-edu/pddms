import { db } from '@main/db'
import type { Drug, NewDrug } from '@shared/types'

export interface ProductWithInventory extends Drug {
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
    ...product,
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

export async function insertOne(data: NewDrug): Promise<Drug> {
  return await db.insertInto('drugs').values(data).returningAll().executeTakeFirstOrThrow()
}

export async function removeOneById(id: number): Promise<void> {
  await db
    .updateTable('drugs')
    .set({ isArchived: 1 })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
