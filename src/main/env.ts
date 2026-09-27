import 'dotenv/config'
import electron from 'electron'
import { join, resolve } from 'node:path'
import * as z from 'zod'

const envSchema = z.strictObject({
  DATABASE: z.string().nonempty(),
  DATABASE_BACKUP: z.string().nonempty()
})

export type Env = z.infer<typeof envSchema>

const packagedDefault = !process.env.DATABASE && electron.app?.isPackaged
export const legacyDatabase = packagedDefault ? resolve('pddms.db') : undefined

export const env: Env = envSchema.parse({
  DATABASE:
    process.env.DATABASE ??
    (packagedDefault ? join(electron.app.getPath('userData'), 'pddms.db') : './pddms.db'),
  DATABASE_BACKUP: process.env.DATABASE_BACKUP ?? './pddms-backup.db'
} satisfies Partial<Env>)
