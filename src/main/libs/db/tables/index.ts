import { ACCOUNT_TABLE, type Accounts } from './accounts'
import { BATCH_TABLE, type Batches } from './batches'
import { DRUG_TABLE, type Drugs } from './drugs'

export const Tables = {
  Accounts: ACCOUNT_TABLE,
  Batches: BATCH_TABLE,
  Drugs: DRUG_TABLE
} as const

export interface Database {
  [ACCOUNT_TABLE]: Accounts
  [BATCH_TABLE]: Batches
  [DRUG_TABLE]: Drugs
}

export * from './accounts'
export * from './drugs'
