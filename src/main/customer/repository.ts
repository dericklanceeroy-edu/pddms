import { db } from '@main/db'
import type { Customer, CustomerUpdate, NewCustomer } from '@shared/types'
import { sql } from 'kysely'

export async function findAll(): Promise<Customer[]> {
  return await db.selectFrom('customers').selectAll().orderBy('fullName').execute()
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
