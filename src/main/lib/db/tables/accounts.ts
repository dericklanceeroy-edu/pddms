import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'
import type { Id } from '..'

export const ACCOUNT_TABLE = 'accounts'

export interface Accounts {
  id: ColumnType<Id, Id | undefined, never>
  username: string
  password: string
  createdAt: ColumnType<Date, string | undefined, never>
  updatedAt: ColumnType<Date, string | undefined, never>
}

export type Account = Selectable<Accounts>
export type NewAccount = Insertable<Accounts>
export type AccountUpdate = Updateable<Accounts>
