import { ACCOUNT_TABLE, type Accounts } from './accounts'
import { DRUG_TABLE, type Drugs } from './drugs'

export const Tables = {
  Accounts: ACCOUNT_TABLE,
  Drugs: DRUG_TABLE
} as const

export interface Database {
  [ACCOUNT_TABLE]: Accounts
  [DRUG_TABLE]: Drugs
}

export * from './accounts'
export * from './drugs'
