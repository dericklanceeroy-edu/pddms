import { db } from '@lib/db'
import type { NewUser, User, UserUpdate } from '@lib/db/tables'

export async function insert(data: NewUser): Promise<User> {
  // prettier-ignore
  return await db
    .insertInto('users')
    .values(data)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function selectById(id: number): Promise<User | null> {
  // prettier-ignore
  return await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst() ?? null
}

export async function updateById(id: number, data: UserUpdate): Promise<void> {
  // prettier-ignore
  await db
    .updateTable('users')
    .set(data)
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

export async function deleteById(id: number): Promise<void> {
  // prettier-ignore
  await db
    .deleteFrom('users')
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
