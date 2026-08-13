import type { Account } from '@lib/db/tables'

export type AccountWithoutPassword = Omit<Account, 'password'>
