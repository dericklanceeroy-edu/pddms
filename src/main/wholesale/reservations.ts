import type { Database } from '@shared/types'
import { sql, type Kysely } from 'kysely'

/**
 * Pieces of each batch promised to wholesale orders that are not delivered yet (pending or
 * scheduled). Stock only leaves a batch at delivery, so these pieces are still on hand but must
 * not be sold again: not to another pharmacy client and not at the retail counter.
 * Pass `batchIds` to limit the lookup; pass a transaction to read inside it.
 */
export async function reservedPiecesFor(
  database: Kysely<Database>,
  batchIds?: number[]
): Promise<Record<number, number>> {
  if (batchIds && !batchIds.length) return {}
  let query = database
    .selectFrom('wholesaleOrderItems')
    .innerJoin('wholesaleOrders', 'wholesaleOrders.id', 'wholesaleOrderItems.orderId')
    .select([
      'wholesaleOrderItems.batchId',
      sql<number>`SUM(wholesale_order_items.quantity * wholesale_order_items.pieces_per_unit)`.as(
        'pieces'
      )
    ])
    .where('wholesaleOrders.status', 'in', ['pending', 'scheduled'])
  if (batchIds) query = query.where('wholesaleOrderItems.batchId', 'in', batchIds)
  const rows = await query.groupBy('wholesaleOrderItems.batchId').execute()
  return Object.fromEntries(rows.map((row) => [row.batchId, Number(row.pieces)]))
}
