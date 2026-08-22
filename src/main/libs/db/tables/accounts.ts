import type { Role } from '@shared/types'
import type { ColumnType } from 'kysely'
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
