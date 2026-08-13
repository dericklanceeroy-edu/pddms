import { Accounts, ACCOUNT_TABLE } from './accounts'

export const Tables = {
  Accounts: ACCOUNT_TABLE
} as const

export interface Database {
  [ACCOUNT_TABLE]: Accounts
}

export * from './accounts'
