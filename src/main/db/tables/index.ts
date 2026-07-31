import { Users, USER_TABLE } from './users'

export const Tables = {
  Users: USER_TABLE
} as const

export interface Database {
  [USER_TABLE]: Users
}

export * from './users'
