import { roles } from '@libs/access-control'
import type { Account, AccountUpdate, NewAccount } from '@shared/types'
import * as z from 'zod'

export function isAccountId(value: unknown): value is Account['id'] {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

export function isAccountUsername(value: unknown): value is Account['username'] {
  return typeof value === 'string'
}

export const accountSchema: z.ZodType<Account> = z.strictObject({
  id: z.number().positive(),
  role: z.enum(Object.values(roles)),
  username: z.string().min(4),
  password: z.string().min(8),
  createdAt: z.date(),
  updatedAt: z.date()
})

export const newAccountSchema: z.ZodType<NewAccount> = z.strictObject({
  role: z.enum(Object.values(roles)),
  username: z.string(),
  password: z.string()
})

export const accountUpdateSchema: z.ZodType<AccountUpdate> = z.strictObject({
  username: z.string().optional(),
  password: z.string().optional()
})
