import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { Id } from '..'

export const USER_TABLE = 'users'

export interface Users {
  id: ColumnType<Id, Id | undefined, never>
  username: string
  password: string
  createdAt: ColumnType<Date, string | undefined, never>
  updatedAt: ColumnType<Date, string | undefined, never>
}

export type User = Selectable<Users>
export type NewUser = Insertable<Users>
export type UserUpdate = Updateable<Users>
