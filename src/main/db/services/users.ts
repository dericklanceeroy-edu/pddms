import { db } from '../index'
import type { NewUser, User, UserUpdate } from '../tables'

export async function insert(data: NewUser): Promise<User> {
  return await db.insertInto('users').values(data).returningAll().executeTakeFirstOrThrow()
}

export async function selectById(id: number): Promise<User | undefined> {
  return await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function updateById(id: number, data: UserUpdate): Promise<void> {
  await db.updateTable('users').set(data).where('id', '=', id).executeTakeFirstOrThrow()
}

export async function deleteById(id: number): Promise<void> {
  await db.deleteFrom('users').where('id', '=', id).executeTakeFirstOrThrow()
}
