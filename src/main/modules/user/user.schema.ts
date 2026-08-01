import type { NewUser, User, UserUpdate } from '@lib/db/tables'
import { type IdSchema, idSchema } from '@lib/schema'
import * as z from 'zod'

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

// prettier-ignore
export const userUpdateSchema: z.ZodType<UserUpdate & IdSchema> = z.strictObject({
    username: z.string().optional(),
    password: z.string().optional()
}).extend(idSchema.shape)
