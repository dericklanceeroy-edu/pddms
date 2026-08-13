import type { Account } from '@libs/db/tables'

export type AccountWithoutPassword = Omit<Account, 'password'>
