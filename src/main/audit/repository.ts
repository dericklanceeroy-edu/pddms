import { db } from '@main/db'
import type { AuditRecord } from '@shared/security'
import type { Account } from '@shared/types'
import { randomUUID } from 'node:crypto'

export async function audit(
  action: string,
  result: string,
  account?: Pick<Account, 'id' | 'username'>,
  targetId: number | null = null
): Promise<number> {
  const record = await db
    .insertInto('auditLogs')
    .values({
      eventId: randomUUID(),
      actorId: account?.id ?? null,
      actorName: account?.username ?? 'Unauthenticated',
      action,
      resource: action.split('.')[0],
      targetId,
      result,
      createdAt: new Date().toISOString()
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return record.id
}
export interface AuditFilter {
  search: string
  beforeId?: number
  /** Local calendar dates, inclusive. */
  from?: string
  to?: string
  result?: string
  resource?: string
}
/** Start of a local calendar day as a stored ISO timestamp. */
const dayStart = (date: string): string => new Date(`${date}T00:00:00`).toISOString()
const nextDayStart = (date: string): string => {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + 1)
  return value.toISOString()
}
export async function listAudit(filter: AuditFilter): Promise<AuditRecord[]> {
  const { search, beforeId, from, to, result, resource } = filter
  let query = db.selectFrom('auditLogs').selectAll().orderBy('id', 'desc').limit(100)
  if (beforeId) query = query.where('id', '<', beforeId)
  if (from) query = query.where('createdAt', '>=', dayStart(from))
  if (to) query = query.where('createdAt', '<', nextDayStart(to))
  if (result) query = query.where('result', '=', result)
  if (resource) query = query.where('resource', '=', resource)
  if (search)
    query = query.where((eb) =>
      eb.or([
        eb('actorName', 'like', `%${search}%`),
        eb('action', 'like', `%${search}%`),
        eb('result', 'like', `%${search}%`)
      ])
    )
  return query.execute()
}

/** Resources that appear in the log, for the activity filter. */
export async function auditResources(): Promise<string[]> {
  const rows = await db
    .selectFrom('auditLogs')
    .select('resource')
    .distinct()
    .orderBy('resource')
    .execute()
  return rows.map((row) => row.resource)
}
