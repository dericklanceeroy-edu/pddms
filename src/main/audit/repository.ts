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
export async function listAudit(search: string, beforeId?: number): Promise<AuditRecord[]> {
  let query = db.selectFrom('auditLogs').selectAll().orderBy('id', 'desc').limit(100)
  if (beforeId) query = query.where('id', '<', beforeId)
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
