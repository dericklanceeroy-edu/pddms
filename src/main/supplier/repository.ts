import { db } from '@main/db'
import type { NewSupplier, Supplier, SupplierUpdate } from '@shared/types'

export async function findAll(): Promise<Supplier[]> {
  return await db.selectFrom('suppliers').selectAll().orderBy('organization').execute()
}

export async function insertOne(data: NewSupplier): Promise<Supplier> {
  return await db.insertInto('suppliers').values(data).returningAll().executeTakeFirstOrThrow()
}

export async function updateOneById(id: number, data: SupplierUpdate): Promise<Supplier> {
  return await db
    .updateTable('suppliers')
    .set(data)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function removeOneById(id: number): Promise<void> {
  await db.deleteFrom('suppliers').where('id', '=', id).executeTakeFirstOrThrow()
}

export async function countOrdersBySupplier(id: number): Promise<number> {
  const result = await db
    .selectFrom('purchaseOrders')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .where('supplierId', '=', id)
    .executeTakeFirstOrThrow()

  return Number(result.count)
}

export async function countBatchesBySupplier(id: number): Promise<number> {
  const result = await db
    .selectFrom('batches')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .where('supplierId', '=', id)
    .executeTakeFirstOrThrow()

  return Number(result.count)
}
