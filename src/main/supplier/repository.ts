import { db } from '@main/db'
import { compactKey } from '@shared/duplicates'
import type { NewSupplier, Supplier, SupplierUpdate } from '@shared/types'

/** Rejects a second supplier with the same organization name, ignoring case, spacing and punctuation. */
async function rejectDuplicate(organization: string, exceptId?: number): Promise<void> {
  const key = compactKey(organization)
  const match = (await db.selectFrom('suppliers').select(['id', 'organization']).execute()).find(
    (supplier) => supplier.id !== exceptId && compactKey(supplier.organization) === key
  )
  if (match) throw new Error(`${match.organization} is already saved as a supplier. Open that record instead.`)
}

export async function findAll(): Promise<Supplier[]> {
  return await db.selectFrom('suppliers').selectAll().orderBy('organization').execute()
}

export async function insertOne(data: NewSupplier): Promise<Supplier> {
  await rejectDuplicate(data.organization)
  return await db.insertInto('suppliers').values(data).returningAll().executeTakeFirstOrThrow()
}

export async function updateOneById(id: number, data: SupplierUpdate): Promise<Supplier> {
  if (data.organization !== undefined) await rejectDuplicate(data.organization, id)
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
