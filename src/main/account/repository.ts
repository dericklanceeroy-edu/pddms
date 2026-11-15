import { noteAudit } from '@main/audit/repository'
import { auditChanges } from '@shared/security'
import { db } from '@main/db'
import type { Account, AccountUpdate, NewAccount } from '@shared/types'
import { sql } from 'kysely'

export async function insertOne(data: NewAccount): Promise<Account> {
  // prettier-ignore
  return await db
    .insertInto('accounts')
    .values(data)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function findOneById(id: number): Promise<Account | null> {
  // prettier-ignore
  return (
    (await db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) ?? null
  )
}

export async function findOneByUsername(username: string): Promise<Account | null> {
  return (
    (await db
      .selectFrom('accounts')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst()) ?? null
  )
}

/** Another account already using this email, ignoring letter case. */
export async function findOneByEmail(email: string): Promise<Account | null> {
  return (
    (await db
      .selectFrom('accounts')
      .selectAll()
      .where(sql`lower(email)`, '=', email.toLowerCase())
      .executeTakeFirst()) ?? null
  )
}

export async function insertMasterIfEmpty(data: NewAccount): Promise<Account | null> {
  return await db.transaction().execute(async (transaction) => {
    const result = await transaction
      .selectFrom('accounts')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
    if (Number(result.count) !== 0) return null
    return await transaction
      .insertInto('accounts')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
}

export async function findAll(): Promise<Account[]> {
  return await db.selectFrom('accounts').selectAll().orderBy('createdAt', 'desc').execute()
}

export async function countAll(): Promise<number> {
  const result = await db
    .selectFrom('accounts')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()

  return Number(result.count)
}

export async function updateOneById(id: number, data: AccountUpdate): Promise<void> {
  const before = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirst()
  if (before)
    noteAudit({
      summary: `Account ${before.username}`,
      // Note: Password changes are noted without their values.
      changes: [
        ...auditChanges(before, data, {
          username: 'Username',
          fullName: 'Full name',
          role: 'Role',
          email: 'Email',
          phone: 'Mobile',
          isVerified: 'Verified'
        }),
        ...(data.password ? [{ field: 'Password', from: '(hidden)', to: '(changed)' }] : [])
      ]
    })
  // prettier-ignore
  await db
    .updateTable('accounts')
    .set({...data, updatedAt: sql`CURRENT_TIMESTAMP`})
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

export async function setBlockedById(id: number, blocked: boolean): Promise<void> {
  noteAudit({ changes: [{ field: 'Blocked', from: !blocked, to: blocked }] })
  await db
    .updateTable('accounts')
    .set({ isArchived: blocked ? 1 : 0 })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

export async function removeOneById(id: number): Promise<void> {
  await db.deleteFrom('accounts').where('id', '=', id).executeTakeFirstOrThrow()
}
