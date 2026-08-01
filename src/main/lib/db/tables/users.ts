import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'

export const USER_TABLE = 'users'

export interface Users {
  id: ColumnType<number, number | undefined, never>
  username: string
  password: string
  createdAt: ColumnType<Date, string | undefined, never>
  updatedAt: ColumnType<Date, string | undefined, never>
}

export type User = Selectable<Users>
export type NewUser = Insertable<Users>
export type UserUpdate = Updateable<Users>
