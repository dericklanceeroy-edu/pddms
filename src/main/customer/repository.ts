import { db } from '@main/db'
import type { Customer, CustomerUpdate, NewCustomer } from '@shared/types'
import { sql } from 'kysely'

export async function findAll(cashierId?: number): Promise<
  Array<
    Customer & {
      transactions: Array<{ id: string; purchasedAt: string; itemCount: number; total: number }>
    }
  >
> {
  const customers = await db.selectFrom('customers').selectAll().orderBy('fullName').execute()
  let query = db
    .selectFrom('sales')
    .innerJoin('saleItems', 'saleItems.saleId', 'sales.id')
    .select([
      'sales.id',
      'sales.reference',
      'sales.customerId',
      'sales.createdAt',
      'sales.totalCents'
    ])
    .select(({ fn }) => fn.sum<number>('saleItems.quantity').as('itemCount'))
    .where('sales.customerId', 'is not', null)
    .groupBy('sales.id')
    .orderBy('sales.id', 'desc')
  if (cashierId !== undefined) query = query.where('sales.cashierId', '=', cashierId)
  const sales = await query.execute()
  return customers.map((customer) => ({
    ...customer,
    transactions: sales
      .filter((sale) => sale.customerId === customer.id)
      .map((sale) => ({
        id: sale.reference,
        purchasedAt: sale.createdAt,
        itemCount: Number(sale.itemCount),
        total: sale.totalCents / 100
      }))
  }))
}

export async function insertOne(data: NewCustomer): Promise<Customer> {
  return await db.insertInto('customers').values(data).returningAll().executeTakeFirstOrThrow()
}

export async function updateOneById(id: number, data: CustomerUpdate): Promise<Customer> {
  return await db
    .updateTable('customers')
    .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function removeOneById(id: number): Promise<void> {
  await db.deleteFrom('customers').where('id', '=', id).executeTakeFirstOrThrow()
}
