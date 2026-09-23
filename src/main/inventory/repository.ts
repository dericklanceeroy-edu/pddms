import { db } from '@main/db'
import { findAll } from '@main/product/repository'
import type { StockOutRecord, StockOutValues } from '@shared/inventory'
import { expiryLabels, getExpiryStatus, isBatchSellable } from '@shared/inventory'
import { stockOutSchema } from '@shared/schemas'
import type { Database } from '@shared/types'
import type { Transaction } from 'kysely'

export async function recordStockOut(input: StockOutValues, recordedBy: number): Promise<void> {
  const data = stockOutSchema.parse(input)
  await db.transaction().execute((transaction) => deductBatchStock(transaction, data, recordedBy))
}

export async function deductBatchStock(
  transaction: Transaction<Database>,
  input: StockOutValues,
  recordedBy: number
): Promise<void> {
  const data = stockOutSchema.parse(input)
  const batch = await transaction
    .selectFrom('batches')
    .select(['id', 'currentStock'])
    .where('id', '=', data.batchId)
    .executeTakeFirst()
  if (!batch) throw new Error('Inventory batch not found.')
  if (data.quantity > batch.currentStock)
    throw new Error('Stock-out quantity exceeds current batch stock.')
  const result = await transaction
    .updateTable('batches')
    .set((expression) => ({ currentStock: expression('currentStock', '-', data.quantity) }))
    .where('id', '=', batch.id)
    .where('currentStock', '>=', data.quantity)
    .executeTakeFirstOrThrow()
  if (Number(result.numUpdatedRows) !== 1)
    throw new Error('Batch stock changed. Reload and try again.')
  await transaction
    .insertInto('stockOuts')
    .values({ ...data, recordedBy })
    .executeTakeFirstOrThrow()
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
      'stockOuts.createdAt',
      'accounts.fullName as recordedByName',
      'batches.physicalTag'
    ])
    .where('batches.drugId', '=', drugId)
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
