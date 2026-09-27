import { database } from '@main/db'
import { env } from '@main/env'
import type { BackupInfo } from '@shared/security'
import SQLite from 'better-sqlite3'
import { app } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, renameSync } from 'node:fs'
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import z from 'zod'

export const invoiceDirectory = (): string => join(app.getPath('userData'), 'supplier-invoices')
export const backupDirectory = (): string => join(app.getPath('userData'), 'backups')
const safeName = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/)
  .regex(/\.(pdf|png|jpe?g|webp)$/i)
const fileSchema = z.strictObject({ name: safeName, sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const manifestSchema = z.strictObject({
  format: z.literal('pddms-backup-v1'),
  createdAt: z.string().datetime(),
  database: z.string().regex(/^[a-f0-9]{64}$/),
  invoices: z.array(fileSchema)
})
async function digest(path: string): Promise<string> {
  const details = await lstat(path)
  if (!details.isFile() || details.isSymbolicLink())
    throw new Error('Backup contains an unsafe file.')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
function schema(connection: SQLite.Database): string {
  return JSON.stringify(
    connection
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('kysely_migration', 'kysely_migration_lock') ORDER BY type, name"
      )
      .all()
  )
}
function invoiceNames(connection: SQLite.Database): string[] {
  return [
    ...new Set(
      (
        connection.prepare('SELECT stored_filename AS name FROM supplier_invoices').all() as {
          name: string
        }[]
      ).map((row) => safeName.parse(row.name))
    )
  ]
}
export async function createBackup(parent = backupDirectory()): Promise<BackupInfo> {
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'pddms-backup-'))
  const target = join(directory, 'database.sqlite')
  await database.backup(target)
  const snapshot = new SQLite(target, { readonly: true, fileMustExist: true })
  let names: string[]
  try {
    names = invoiceNames(snapshot)
  } finally {
    snapshot.close()
  }
  await mkdir(join(directory, 'invoices'))
  const invoices: Array<{ name: string; sha256: string }> = []
  for (const name of names) {
    const source = join(invoiceDirectory(), name)
    const sha256 = await digest(source)
    await copyFile(source, join(directory, 'invoices', name))
    if ((await digest(join(directory, 'invoices', name))) !== sha256)
      throw new Error('Invoice changed during backup. Retry.')
    invoices.push({ name, sha256 })
  }
  const createdAt = new Date().toISOString()
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify(
      { format: 'pddms-backup-v1', createdAt, database: await digest(target), invoices },
      null,
      2
    ),
    { flag: 'wx' }
  )
  return { directory, createdAt, invoiceCount: invoices.length }
}
export async function validateBackup(directory: string): Promise<BackupInfo> {
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error('Select a regular backup directory.')
  await digest(join(directory, 'manifest.json'))
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  )
  if ((await digest(join(directory, 'database.sqlite'))) !== manifest.database)
    throw new Error('Backup database checksum does not match.')
  const snapshot = new SQLite(join(directory, 'database.sqlite'), {
    readonly: true,
    fileMustExist: true
  })
  try {
    snapshot.pragma('trusted_schema = OFF')
    if (schema(snapshot) !== schema(database))
      throw new Error('Backup schema is incompatible with this application version.')
    if (
      snapshot.pragma('integrity_check', { simple: true }) !== 'ok' ||
      (snapshot.pragma('foreign_key_check') as unknown[]).length
    )
      throw new Error('Backup database integrity check failed.')
    const master = snapshot
      .prepare(
        "SELECT id FROM accounts WHERE role = 'master' AND is_archived = 0 AND is_verified = 1"
      )
      .get()
    if (!master) throw new Error('Backup must contain an active verified master account.')
    const names = invoiceNames(snapshot).sort()
    if (JSON.stringify(names) !== JSON.stringify(manifest.invoices.map((item) => item.name).sort()))
      throw new Error('Backup invoice references do not match.')
    if ((await lstat(join(directory, 'invoices'))).isSymbolicLink())
      throw new Error('Unsafe invoice directory.')
    for (const item of manifest.invoices)
      if ((await digest(join(directory, 'invoices', item.name))) !== item.sha256)
        throw new Error('Backup invoice checksum does not match.')
  } finally {
    snapshot.close()
  }
  return { directory, createdAt: manifest.createdAt, invoiceCount: manifest.invoices.length }
}
export async function listBackups(): Promise<BackupInfo[]> {
  await mkdir(backupDirectory(), { recursive: true })
  const results: BackupInfo[] = []
  for (const entry of await readdir(backupDirectory(), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !entry.name.startsWith('pddms-backup-'))
      continue
    try {
      const directory = join(backupDirectory(), entry.name)
      const manifest = manifestSchema.parse(
        JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
      )
      results.push({
        directory,
        createdAt: manifest.createdAt,
        invoiceCount: manifest.invoices.length
      })
    } catch {
      /* Note: Incomplete backups are never offered for restoration. */
    }
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function restoreBackup(source: string): Promise<{ safety: BackupInfo }> {
  await validateBackup(source)
  const staging = await mkdtemp(join(dirname(resolve(env.DATABASE)), 'pddms-restore-'))
  await mkdir(join(staging, 'invoices'))
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
  )
  await copyFile(join(source, 'database.sqlite'), join(staging, 'database.sqlite'))
  await copyFile(join(source, 'manifest.json'), join(staging, 'manifest.json'))
  for (const item of manifest.invoices)
    await copyFile(join(source, 'invoices', item.name), join(staging, 'invoices', item.name))
  await validateBackup(staging)
  const safety = await createBackup()
  await mkdir(invoiceDirectory(), { recursive: true })
  const previousInvoices = join(
    dirname(invoiceDirectory()),
    `supplier-invoices-before-${randomUUID()}`
  )
  const nextInvoices = await mkdtemp(join(dirname(invoiceDirectory()), 'supplier-invoices-next-'))
  for (const item of manifest.invoices)
    await copyFile(join(staging, 'invoices', item.name), join(nextInvoices, item.name))
  const tables = (
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('kysely_migration', 'kysely_migration_lock')"
      )
      .all() as { name: string }[]
  ).map((row) => row.name)
  const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`
  database.prepare('ATTACH DATABASE ? AS recovery').run(join(staging, 'database.sqlite'))
  let swapped = false
  try {
    database.pragma('foreign_keys = OFF')
    database.exec('BEGIN IMMEDIATE')
    for (const table of tables) {
      if (table === 'audit_logs') continue
      database.exec(`DELETE FROM main.${quote(table)}`)
      database.exec(`INSERT INTO main.${quote(table)} SELECT * FROM recovery.${quote(table)}`)
    }
    database.exec(
      'INSERT OR IGNORE INTO main.audit_logs (event_id, actor_id, actor_name, action, resource, target_id, result, created_at) SELECT event_id, actor_id, actor_name, action, resource, target_id, result, created_at FROM recovery.audit_logs'
    )
    if (
      (database.pragma('foreign_key_check') as unknown[]).length ||
      database.pragma('integrity_check', { simple: true }) !== 'ok'
    )
      throw new Error('Restored records failed integrity checks.')
    renameSync(invoiceDirectory(), previousInvoices)
    try {
      renameSync(nextInvoices, invoiceDirectory())
    } catch (error) {
      renameSync(previousInvoices, invoiceDirectory())
      throw error
    }
    swapped = true
    database.exec('COMMIT')
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    if (swapped) {
      renameSync(invoiceDirectory(), nextInvoices)
      renameSync(previousInvoices, invoiceDirectory())
    }
    throw error
  } finally {
    database.pragma('foreign_keys = ON')
    database.exec('DETACH DATABASE recovery')
  }
  return { safety }
}
