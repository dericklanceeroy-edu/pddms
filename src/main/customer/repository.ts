import { db } from '@main/db'
import { compactKey, phoneKey } from '@shared/duplicates'
import type { Customer, CustomerUpdate, NewCustomer } from '@shared/types'
import { sql } from 'kysely'

/** `cashierId` limits purchase history to that cashier's sales; `retailOnly` hides pharmacy clients. */
export async function findAll(cashierId?: number, retailOnly = false): Promise<
  Array<
    Customer & {
      transactions: Array<{ id: string; purchasedAt: string; itemCount: number; total: number }>
    }
  >
> {
  let customerQuery = db.selectFrom('customers').selectAll().orderBy('fullName')
  if (retailOnly) customerQuery = customerQuery.where('clientType', '=', 'retail')
  const customers = await customerQuery.execute()
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
    .select(({ fn }) =>
      fn.sum<number>(sql<number>`sale_items.quantity * sale_items.pieces_per_unit`).as('itemCount')
    )
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

export async function findOneById(id: number): Promise<Customer | undefined> {
  return db.selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirst()
}

/**
 * Rejects a second record for the same person or pharmacy: same name and same mobile number after
 * ignoring case, spacing and punctuation. Different people may still share one phone number.
 */
async function rejectDuplicate(fullName: string, phone: string, exceptId?: number): Promise<void> {
  const name = compactKey(fullName)
  const mobile = phoneKey(phone)
  const match = (await db.selectFrom('customers').select(['id', 'fullName', 'phone', 'clientType']).execute()).find(
    (customer) =>
      customer.id !== exceptId &&
      compactKey(customer.fullName) === name &&
      phoneKey(customer.phone) === mobile
  )
  if (match)
    throw new Error(
      `${match.fullName} with this phone number is already saved as a ${match.clientType === 'pharmacy' ? 'pharmacy client' : 'customer'}. Open that record instead.`
    )
}

export async function insertOne(data: NewCustomer): Promise<Customer> {
  await rejectDuplicate(data.fullName, data.phone)
  return await db.insertInto('customers').values(data).returningAll().executeTakeFirstOrThrow()
}

export async function updateOneById(id: number, data: CustomerUpdate): Promise<Customer> {
  const current = await findOneById(id)
  if (!current) throw new Error('Customer not found.')
  await rejectDuplicate(data.fullName ?? current.fullName, data.phone ?? current.phone, id)
  return await db
    .updateTable('customers')
    .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function removeOneById(id: number): Promise<void> {
  const sale = await db.selectFrom('sales').select('id').where('customerId', '=', id).executeTakeFirst()
  const order = await db
    .selectFrom('wholesaleOrders')
    .select('id')
    .where('customerId', '=', id)
    .executeTakeFirst()
  if (sale || order)
    throw new Error(
      `${order ? 'Pharmacy clients with wholesale orders' : 'Customers with sales history'} can't be removed, so their receipts stay complete.`
    )
  await db.deleteFrom('customers').where('id', '=', id).executeTakeFirstOrThrow()
}
