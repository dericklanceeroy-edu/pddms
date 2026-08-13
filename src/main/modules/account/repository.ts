import { db } from '@libs/db'
import type { NewAccount, Account, AccountUpdate } from '@libs/db/tables'

export async function insert(data: NewAccount): Promise<Account> {
  // prettier-ignore
  return await db
    .insertInto('accounts')
    .values(data)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function findById(id: number): Promise<Account | null> {
  // prettier-ignore
  return (
    (await db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) ?? null
  )
}

export async function findByUsername(username: string): Promise<Account | null> {
  return (
    (await db
      .selectFrom('accounts')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst()) ?? null
  )
}

export async function updateById(id: number, data: AccountUpdate): Promise<void> {
  // prettier-ignore
  await db
    .updateTable('accounts')
    .set(data)
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

export async function deleteById(id: number): Promise<void> {
  // prettier-ignore
  await db
    .deleteFrom('accounts')
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
