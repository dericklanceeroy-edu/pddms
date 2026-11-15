import { db } from '@main/db'
import { findAll } from '@main/product/repository'
import type { StockOutRecord, StockOutValues } from '@shared/inventory'
import { expiryLabels, getExpiryStatus, isBatchSellable } from '@shared/inventory'
import { stockOutSchema } from '@shared/schemas'
import { noteAudit } from '@main/audit/repository'
import { writeOffReasons, type Database, type StockOutKind, type WriteOffReason } from '@shared/types'
import type { Transaction } from 'kysely'

/** Writes off stock (expired, damaged, lost, recalled or other) from one batch. */
export async function recordStockOut(input: StockOutValues, recordedBy: number): Promise<void> {
  const data = stockOutSchema.parse(input)
  await db.transaction().execute(async (transaction) => {
    const batch = await transaction
      .selectFrom('batches')
      .innerJoin('drugs', 'drugs.id', 'batches.drugId')
      .select(['batches.physicalTag', 'batches.id', 'drugs.brandName'])
      .where('batches.id', '=', data.batchId)
      .executeTakeFirst()
    await deductBatchStock(
      transaction,
      {
        batchId: data.batchId,
        quantity: data.quantity,
        kind: 'write_off',
        reasonCode: data.reasonCode,
        reason: data.reason || writeOffReasons[data.reasonCode]
      },
      recordedBy
    )
    noteAudit({
      summary: `Wrote off ${data.quantity} piece(s) of ${batch?.brandName ?? 'product'}, batch ${batch?.physicalTag ?? data.batchId}`,
      reason: `${writeOffReasons[data.reasonCode]}${data.reason ? `: ${data.reason}` : ''}`
    })
  })
}

/**
 * Takes pieces out of one batch and records the movement. Every stock decrease goes through here:
 * sales, wholesale deliveries, write-offs and returns to suppliers.
 */
export async function deductBatchStock(
  transaction: Transaction<Database>,
  input: {
    batchId: number
    quantity: number
    reason: string
    kind: StockOutKind
    reasonCode?: WriteOffReason | null
  },
  recordedBy: number
): Promise<number> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    throw new Error('Enter a whole quantity greater than zero.')
  const batch = await transaction
    .selectFrom('batches')
    .select(['id', 'currentStock'])
    .where('id', '=', input.batchId)
    .executeTakeFirst()
  if (!batch) throw new Error('Inventory batch not found.')
  if (input.quantity > batch.currentStock)
    throw new Error('Stock-out quantity exceeds current batch stock.')
  const result = await transaction
    .updateTable('batches')
    .set((expression) => ({ currentStock: expression('currentStock', '-', input.quantity) }))
    .where('id', '=', batch.id)
    .where('currentStock', '>=', input.quantity)
    .executeTakeFirstOrThrow()
  if (Number(result.numUpdatedRows) !== 1)
    throw new Error('Batch stock changed. Reload and try again.')
  const record = await transaction
    .insertInto('stockOuts')
    .values({
      batchId: input.batchId,
      quantity: input.quantity,
      reason: input.reason,
      kind: input.kind,
      reasonCode: input.kind === 'write_off' ? (input.reasonCode ?? 'other') : null,
      recordedBy
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return record.id
}

export async function findStockOuts(drugId: number): Promise<StockOutRecord[]> {
  const rows = await db
    .selectFrom('stockOuts')
    .innerJoin('batches', 'batches.id', 'stockOuts.batchId')
    .innerJoin('accounts', 'accounts.id', 'stockOuts.recordedBy')
    .select([
      'stockOuts.id',
      'stockOuts.batchId',
      'stockOuts.quantity',
      'stockOuts.reason',
      'stockOuts.reasonCode',
      'stockOuts.createdAt',
      'accounts.fullName as recordedByName',
      'batches.physicalTag'
    ])
    .where('batches.drugId', '=', drugId)
    .where('stockOuts.kind', '=', 'write_off')
    .orderBy('stockOuts.id', 'desc')
    .execute()
  return rows.map(({ physicalTag, ...row }) => ({
    ...row,
    batchNumber: physicalTag ?? `Batch ${row.batchId}`
  }))
}

export const csvCell = (value: unknown): string => {
  const text = String(value ?? '')
  const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export async function inventoryCsv(): Promise<string> {
  const products = await findAll()
  const now = new Date()
  const rows: unknown[][] = [
    [
      'Product',
      'Generic',
      'Formulation',
      'Total on hand',
      'Sellable units',
      'Reorder level',
      'Stock status',
      'Batch',
      'Batch stock',
      'Supplier',
      'Expiry date',
      'Expiry status',
      'Receiving dates / PO'
    ]
  ]
  for (const product of products) {
    const quantity = product.batches.reduce((total, batch) => total + batch.stock, 0)
    const sellable = product.batches
      .filter((batch) => isBatchSellable(batch.stock, String(batch.expiresAt), now))
      .reduce((total, batch) => total + batch.stock, 0)
    const base = [
      product.brandName,
      product.genericName,
      product.formulation,
      quantity,
      sellable,
      product.reorderLevel,
      sellable === 0 ? 'Out of stock' : sellable <= product.reorderLevel ? 'Low stock' : 'In stock'
    ]
    if (!product.batches.length) rows.push([...base, '', 0, '', '', 'No batches', ''])
    for (const batch of product.batches)
      rows.push([
        ...base,
        batch.batchNumber,
        batch.stock,
        batch.supplier,
        String(batch.expiresAt),
        expiryLabels[getExpiryStatus(String(batch.expiresAt), now)],
        batch.receipts
          .map((receipt) => `${receipt.deliveredAt} / ${receipt.orderNumber}`)
          .join('; ')
      ])
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
