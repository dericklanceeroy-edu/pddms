import 'dotenv/config'
import * as z from 'zod'

const envSchema = z.strictObject({
  DATABASE: z.string().nonempty().default('./pddms.db'),
  DATABASE_BACKUP: z.string().nonempty().default('pddms-backup.db')
})

export type Env = z.infer<typeof envSchema>

export const env: Env = envSchema.parse({
  DATABASE: process.env.DATABASE,
  DATABASE_BACKUP: process.env.DATABASE_BACKUP
} satisfies Partial<Env>)
