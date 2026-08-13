import type { NewUser, User, UserUpdate } from '@lib/db/tables'
import * as z from 'zod'

export function isUserId(value: unknown): value is User['id'] {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

export function isUserUsername(value: unknown): value is User['username'] {
  return typeof value === 'string'
}

export const userSchema: z.ZodType<User> = z.strictObject({
  id: z.number().positive(),
  username: z.string().min(4),
  password: z.string().min(8),
  createdAt: z.date(),
  updatedAt: z.date()
})

export const newUserSchema: z.ZodType<NewUser> = z.strictObject({
  username: z.string(),
  password: z.string()
})

export const userUpdateSchema: z.ZodType<UserUpdate> = z.strictObject({
  username: z.string().optional(),
  password: z.string().optional()
})
