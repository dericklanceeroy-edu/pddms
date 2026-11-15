import { noteAudit } from '@main/audit/repository'
import { db } from '@main/db'
import { deductBatchStock } from '@main/inventory/repository'
import { orderBalances } from '@main/procurement/repository'
import {
  applyCreditSchema,
  creditNoteSchema,
  supplierReturnSchema,
  type CreditNoteInput,
  type CreditNoteRecord,
  type SupplierReturnInput,
  type SupplierReturnRecord
} from '@shared/controls'
import { supplierReturnReasons, type Database } from '@shared/types'
import type { Transaction } from 'kysely'

/**
 * Stock sent back to a supplier (near expiry, damaged, wrong item, recalled) and the supplier's
 * credit notes. A return takes the pieces out of their batch. A credit note lowers what is owed
 * on a purchase order; one received before there is anything to lower stays unapplied until the
 * administrator applies it to a later order.
 */

const peso = (value: number): string => `₱${value.toFixed(2)}`

export async function findReturns(): Promise<{
  returns: SupplierReturnRecord[]
  creditNotes: CreditNoteRecord[]
}> {
  const returns = await db
    .selectFrom('supplierReturns')
    .innerJoin('suppliers', 'suppliers.id', 'supplierReturns.supplierId')
    .innerJoin('batches', 'batches.id', 'supplierReturns.batchId')
    .innerJoin('drugs', 'drugs.id', 'batches.drugId')
    .innerJoin('accounts', 'accounts.id', 'supplierReturns.recordedBy')
    .leftJoin('supplierCreditNotes', 'supplierCreditNotes.id', 'supplierReturns.creditNoteId')
    .select([
      'supplierReturns.id',
      'supplierReturns.supplierId',
      'suppliers.organization as supplierName',
      'drugs.brandName',
      'drugs.genericName',
      'batches.physicalTag',
      'batches.id as batchId',
      'batches.buyPrice',
      'supplierReturns.quantity',
      'supplierReturns.reasonCode',
      'supplierReturns.notes',
      'supplierReturns.returnedAt',
      'supplierReturns.creditNoteId',
      'supplierCreditNotes.creditNoteNumber',
      'accounts.fullName as recordedByName'
    ])
    .orderBy('supplierReturns.returnedAt', 'desc')
    .orderBy('supplierReturns.id', 'desc')
    .execute()
  const notes = await db
    .selectFrom('supplierCreditNotes')
    .innerJoin('suppliers', 'suppliers.id', 'supplierCreditNotes.supplierId')
    .innerJoin('accounts', 'accounts.id', 'supplierCreditNotes.recordedBy')
    .leftJoin('purchaseOrders', 'purchaseOrders.id', 'supplierCreditNotes.purchaseOrderId')
    .select((eb) => [
      'supplierCreditNotes.id',
      'supplierCreditNotes.supplierId',
      'suppliers.organization as supplierName',
      'supplierCreditNotes.creditNoteNumber',
      'supplierCreditNotes.issuedAt',
      'supplierCreditNotes.amount',
      'supplierCreditNotes.purchaseOrderId',
      'purchaseOrders.orderNumber',
      'supplierCreditNotes.appliedAt',
      'supplierCreditNotes.notes',
      'accounts.fullName as recordedByName',
      eb
        .selectFrom('supplierReturns')
        .select((inner) => inner.fn.countAll<number>().as('count'))
        .whereRef('supplierReturns.creditNoteId', '=', 'supplierCreditNotes.id')
        .as('returnCount')
    ])
    .orderBy('supplierCreditNotes.issuedAt', 'desc')
    .orderBy('supplierCreditNotes.id', 'desc')
    .execute()
  return {
    returns: returns.map(({ brandName, genericName, physicalTag, batchId, buyPrice, ...row }) => ({
      ...row,
      productName: `${brandName} (${genericName})`,
      batchNumber: physicalTag ?? `Batch ${batchId}`,
      costValue: Number((buyPrice * row.quantity).toFixed(2))
    })),
    creditNotes: notes.map((note) => ({
      ...note,
      orderNumber: note.orderNumber ?? null,
      returnCount: Number(note.returnCount ?? 0)
    }))
  }
}

export async function recordReturn(input: SupplierReturnInput, accountId: number): Promise<number> {
  const data = supplierReturnSchema.parse(input)
  return db.transaction().execute(async (transaction) => {
    const batch = await transaction
      .selectFrom('batches')
      .innerJoin('drugs', 'drugs.id', 'batches.drugId')
      .innerJoin('suppliers', 'suppliers.id', 'batches.supplierId')
      .select([
        'batches.id',
        'batches.supplierId',
        'batches.physicalTag',
        'batches.currentStock',
        'drugs.brandName',
        'suppliers.organization'
      ])
      .where('batches.id', '=', data.batchId)
      .executeTakeFirst()
    if (!batch) throw new Error('Batch not found.')
    if (data.quantity > batch.currentStock)
      throw new Error(
        `Only ${batch.currentStock} piece(s) of batch ${batch.physicalTag ?? batch.id} are in stock.`
      )
    const reason = `Returned to ${batch.organization}: ${supplierReturnReasons[data.reasonCode]}${data.notes ? ` (${data.notes})` : ''}`
    const stockOutId = await deductBatchStock(
      transaction,
      { batchId: batch.id, quantity: data.quantity, reason, kind: 'supplier_return' },
      accountId
    )
    const record = await transaction
      .insertInto('supplierReturns')
      .values({
        supplierId: batch.supplierId,
        batchId: batch.id,
        stockOutId,
        quantity: data.quantity,
        reasonCode: data.reasonCode,
        notes: data.notes || null,
        returnedAt: data.returnedAt,
        recordedBy: accountId
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    noteAudit({
      summary: `Returned ${data.quantity} piece(s) of ${batch.brandName}, batch ${batch.physicalTag ?? batch.id}, to ${batch.organization}`,
      reason: supplierReturnReasons[data.reasonCode] + (data.notes ? `: ${data.notes}` : '')
    })
    return record.id
  })
}

/** Checks that a credit fits within what the order still owes the supplier. */
async function checkOrderCredit(
  transaction: Transaction<Database>,
  supplierId: number,
  purchaseOrderId: number,
  amount: number
): Promise<string> {
  const order = await transaction
    .selectFrom('purchaseOrders')
    .select(['supplierId', 'orderNumber'])
    .where('id', '=', purchaseOrderId)
    .executeTakeFirst()
  if (!order) throw new Error('Purchase order not found.')
  if (order.supplierId !== supplierId)
    throw new Error('The credit note can only lower an order from the same supplier.')
  const balance = (await orderBalances(transaction, [purchaseOrderId])).get(purchaseOrderId)!
  if (amount > balance.outstanding + 0.005)
    throw new Error(
      `${order.orderNumber} owes only ${peso(balance.outstanding)}. Apply the credit to an order with a larger balance, or keep it for the next order.`
    )
  return order.orderNumber
}

export async function recordCreditNote(input: CreditNoteInput, accountId: number): Promise<number> {
  const data = creditNoteSchema.parse(input)
  return db.transaction().execute(async (transaction) => {
    const supplier = await transaction
      .selectFrom('suppliers')
      .select('organization')
      .where('id', '=', data.supplierId)
      .executeTakeFirst()
    if (!supplier) throw new Error('Supplier not found.')
    const duplicate = await transaction
      .selectFrom('supplierCreditNotes')
      .select('id')
      .where('supplierId', '=', data.supplierId)
      .where('creditNoteNumber', '=', data.creditNoteNumber)
      .executeTakeFirst()
    if (duplicate) throw new Error(`Credit note ${data.creditNoteNumber} is already recorded for this supplier.`)
    const orderNumber = data.purchaseOrderId
      ? await checkOrderCredit(transaction, data.supplierId, data.purchaseOrderId, data.amount)
      : null
    const note = await transaction
      .insertInto('supplierCreditNotes')
      .values({
        supplierId: data.supplierId,
        creditNoteNumber: data.creditNoteNumber,
        issuedAt: data.issuedAt,
        amount: data.amount,
        purchaseOrderId: data.purchaseOrderId,
        appliedAt: data.purchaseOrderId ? new Date().toISOString() : null,
        notes: data.notes || null,
        recordedBy: accountId
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    if (data.returnIds.length) {
      const result = await transaction
        .updateTable('supplierReturns')
        .set({ creditNoteId: note.id })
        .where('id', 'in', data.returnIds)
        .where('supplierId', '=', data.supplierId)
        .where('creditNoteId', 'is', null)
        .executeTakeFirst()
      if (Number(result.numUpdatedRows) !== data.returnIds.length)
        throw new Error('A selected return belongs to another supplier or already has a credit note.')
    }
    noteAudit({
      summary: `Credit note ${data.creditNoteNumber} from ${supplier.organization}, ${peso(data.amount)}${orderNumber ? `, applied to ${orderNumber}` : ', kept for the next order'}`
    })
    return note.id
  })
}

export async function applyCreditNote(input: unknown): Promise<void> {
  const data = applyCreditSchema.parse(input)
  await db.transaction().execute(async (transaction) => {
    const note = await transaction
      .selectFrom('supplierCreditNotes')
      .selectAll()
      .where('id', '=', data.creditNoteId)
      .executeTakeFirst()
    if (!note) throw new Error('Credit note not found.')
    if (note.purchaseOrderId) throw new Error('This credit note is already applied.')
    const orderNumber = await checkOrderCredit(
      transaction,
      note.supplierId,
      data.purchaseOrderId,
      note.amount
    )
    await transaction
      .updateTable('supplierCreditNotes')
      .set({ purchaseOrderId: data.purchaseOrderId, appliedAt: new Date().toISOString() })
      .where('id', '=', note.id)
      .execute()
    noteAudit({
      summary: `Credit note ${note.creditNoteNumber} (${peso(note.amount)}) applied`,
      changes: [{ field: 'Applied to order', from: null, to: orderNumber }]
    })
  })
}
