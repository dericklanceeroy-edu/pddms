import type { Role } from '@libs/access-control'
import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { Id } from '..'

export const ACCOUNT_TABLE = 'accounts'

export interface Accounts {
  id: ColumnType<Id, Id | undefined, never>
  role: Role
  username: string
  password: string
  createdAt: ColumnType<Date, string | undefined, never>
  updatedAt: ColumnType<Date, string | undefined, never>
}

export type Account = Selectable<Accounts>
export type NewAccount = Insertable<Accounts>
export type AccountUpdate = Updateable<Accounts>
