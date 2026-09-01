import { db } from '@main/db'
import type { Account, AccountUpdate, NewAccount } from '@shared/types'

export async function insertOne(data: NewAccount): Promise<Account> {
  // prettier-ignore
  return await db
    .insertInto('accounts')
    .values(data)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function findOneById(id: number): Promise<Account | null> {
  // prettier-ignore
  return (
    (await db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) ?? null
  )
}

export async function findOneByUsername(username: string): Promise<Account | null> {
  return (
    (await db
      .selectFrom('accounts')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst()) ?? null
  )
}

export async function countAll(): Promise<number> {
  const result = await db
    .selectFrom('accounts')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()

  return Number(result.count)
}

export async function updateOneById(id: number, data: AccountUpdate): Promise<void> {
  // prettier-ignore
  await db
    .updateTable('accounts')
    .set(data)
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

export async function archiveOneById(id: number): Promise<void> {
  await db
    .updateTable('accounts')
    .set({ isArchived: 1 })
    .where('id', '=', id)
    .where('isArchived', '==', 0)
    .executeTakeFirstOrThrow()
}
