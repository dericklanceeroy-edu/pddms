import 'dotenv/config'
import * as z from 'zod'

const envSchema = z.strictObject({
  DATABASE: z.string().nonempty()
})

export type Env = z.infer<typeof envSchema>

export const env: Env = envSchema.parse({
  DATABASE: process.env.DATABASE
} satisfies Partial<Env>)
