import z from 'zod'
import { roles } from './constants'
import type { Account, AccountUpdate, Credentials, NewAccount } from './types'

export const accountSchema = z.strictObject({
  id: z.number().positive(),
  role: z.enum(Object.values(roles)),
  username: z.string().min(4),
  password: z.string().min(8),
  isArchived: z.union([z.literal(0), z.literal(1)]),
  createdAt: z.date(),
  updatedAt: z.date()
}) satisfies z.ZodType<Account>

export const newAccountSchema = z.strictObject({
  role: z.enum(Object.values(roles)),
  username: z.string().min(4),
  password: z.string().min(8)
}) satisfies z.ZodType<NewAccount>

export const accountUpdateSchema = z.strictObject({
  role: z.enum(Object.values(roles)).optional(),
  username: z.string().min(4).optional(),
  password: z.string().min(8).optional()
}) satisfies z.ZodType<AccountUpdate>

export const credentialsSchema = z.strictObject({
  username: z.string(),
  password: z.string()
}) satisfies z.ZodType<Credentials>
