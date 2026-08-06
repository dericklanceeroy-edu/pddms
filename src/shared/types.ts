import type { User } from '@lib/db/tables'

export type UserWithoutPassword = Omit<User, 'password'>
