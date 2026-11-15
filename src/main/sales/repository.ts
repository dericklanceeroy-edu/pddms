import { noteAudit } from '@main/audit/repository'
import { db } from '@main/db'
import {
  cashCountSchema,
  countedCents,
  overShortLabel,
  voidSaleSchema,
  type CashCountInput,
  type CashCountPreview,
  type CashCountRecord,
  type VoidSale
} from '@shared/controls'
import { dateBounds } from '@shared/reporting'
import { isLocked, LOGIN_LOCK_MS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from '@shared/security'
import { verify } from 'argon2'
import { deductBatchStock } from '@main/inventory/repository'
import { isBatchSellable, localDate } from '@shared/inventory'
import {
  calculateSale,
  checkoutSchema,
  missingRegisterFields,
  priceToCents,
  saleDiscount,
  saleDraftSchema,
  SalesError,
  type Checkout,
  type SaleDraft,
  type SaleLine,
  type SaleRecord,
  type SaleTotals
} from '@shared/sales'
import type { Database } from '@shared/types'
import { saleUnitPieces, UnitError, unitSellPrice } from '@shared/units'
import type { Kysely } from 'kysely'
import { randomUUID } from 'node:crypto'

type ParsedSaleDraft = ReturnType<typeof saleDraftSchema.parse>

async function prepare(
  database: Kysely<Database>,
  draft: ParsedSaleDraft
): Promise<{
  items: SaleLine[]
  totals: SaleTotals
  customerName: string
  discountId: string | null
  discountExpiresAt: string | null
  /** Prescription (Rx) and controlled medicines in the cart, by product name. */
  prescription: { required: string[]; controlled: string[] }
}> {
  const customer =
    draft.customerId === null
      ? null
      : await database
          .selectFrom('customers')
          .selectAll()
          .where('id', '=', draft.customerId)
          .executeTakeFirst()
  if (draft.customerId !== null && (!customer || customer.isArchived))
    throw new SalesError('Customer not found. Select a current customer.')
  if (customer?.clientType === 'pharmacy')
    throw new SalesError('Pharmacy clients buy through Wholesale & Deliveries, not at the counter.')
  const walkIn = draft.walkInDiscount
  const discount = saleDiscount(customer ?? null, walkIn)
  const batches = await database
    .selectFrom('batches')
    .innerJoin('drugs', 'drugs.id', 'batches.drugId')
    .select([
      'batches.id',
      'batches.drugId',
      'batches.currentStock',
      'batches.sellPrice',
      'batches.boxSellPrice',
      'batches.physicalTag',
      'batches.expiresAt',
      'drugs.brandName',
      'drugs.genericName',
      'drugs.formulation',
      'drugs.category',
      'batches.piecesPerBox',
      'drugs.isArchived',
      'drugs.isPrescribed',
      'drugs.isControlled'
    ])
    .where(
      'batches.id',
      'in',
      draft.items.map((item) => item.batchId)
    )
    .execute()
  // Note: A box and loose pieces of one batch share its stock, so check the combined pieces.
  const piecesByBatch = new Map<number, number>()
  const prescription = { required: new Set<string>(), controlled: new Set<string>() }
  const items = draft.items.map((item): SaleLine => {
    const batch = batches.find((value) => value.id === item.batchId)
    if (!batch || batch.isArchived)
      throw new SalesError('Product or batch is no longer available. Refresh the catalog.')
    if (!isBatchSellable(batch.currentStock, String(batch.expiresAt)))
      throw new SalesError(`${batch.brandName}: batch is expired, invalid, or out of stock.`)
    let pieces: number
    let unitPrice: number
    try {
      pieces = saleUnitPieces(item.unit, batch.piecesPerBox)
      unitPrice = unitSellPrice(item.unit, batch.sellPrice, batch.boxSellPrice, batch.piecesPerBox)
    } catch (error) {
      if (error instanceof UnitError) throw new SalesError(`${batch.brandName}: ${error.message}`)
      throw error
    }
    const pieceTotal = (piecesByBatch.get(batch.id) ?? 0) + item.quantity * pieces
    piecesByBatch.set(batch.id, pieceTotal)
    if (pieceTotal > batch.currentStock)
      throw new SalesError(`${batch.brandName}: insufficient batch stock.`)
    if (batch.isPrescribed || batch.isControlled) prescription.required.add(batch.brandName)
    if (batch.isControlled) prescription.controlled.add(batch.brandName)
    const unitPriceCents = priceToCents(unitPrice)
    if (item.unitPriceCents !== unitPriceCents)
      throw new SalesError('A price changed. Refresh the catalog and re-add the item.')
    return {
      ...item,
      unitPriceCents,
      piecesPerUnit: pieces,
      drugId: batch.drugId,
      productName: `${batch.brandName} (${batch.genericName}) ${batch.formulation}`,
      category: batch.category,
      batchNumber: batch.physicalTag ?? `Batch ${batch.id}`,
      expiresAt: String(batch.expiresAt)
    }
  })
  return {
    items,
    totals: calculateSale(items, discount),
    customerName: walkIn?.holderName ?? customer?.fullName ?? 'Walk-in customer',
    discountId: discount === 'none' ? null : walkIn ? walkIn.discountId : customer!.discountId,
    discountExpiresAt:
      discount === 'none' ? null : walkIn ? walkIn.discountExpiresAt : customer!.discountExpiresAt,
    prescription: {
      required: [...prescription.required],
      controlled: [...prescription.controlled]
    }
  }
}

export async function quote(draft: SaleDraft): Promise<SaleTotals> {
  return (await prepare(db, saleDraftSchema.parse(draft))).totals
}

export async function getSale(id: number, cashierId?: number): Promise<SaleRecord> {
  let query = db.selectFrom('sales').selectAll().where('id', '=', id)
  if (cashierId !== undefined) query = query.where('cashierId', '=', cashierId)
  const sale = await query.executeTakeFirst()
  if (!sale) throw new SalesError('Transaction not found or access denied.')
  const items = await db
    .selectFrom('saleItems')
    .selectAll()
    .where('saleId', '=', id)
    .orderBy('id')
    .execute()
  return { ...sale, items }
}

export async function history(
  beforeId?: number,
  cashierId?: number
): Promise<Omit<SaleRecord, 'items'>[]> {
  let query = db.selectFrom('sales').selectAll().orderBy('id', 'desc').limit(50)
  if (beforeId !== undefined) query = query.where('id', '<', beforeId)
  if (cashierId !== undefined) query = query.where('cashierId', '=', cashierId)
  return query.execute()
}

export async function checkout(input: Checkout, accountId: number): Promise<SaleRecord> {
  const data = checkoutSchema.parse(input)
  const id = await db.transaction().execute(async (transaction) => {
    const account = await transaction
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', accountId)
      .executeTakeFirst()
    if (!account || account.isArchived || !account.isVerified)
      throw new SalesError('Your account is not permitted to complete sales.')
    const existing = await transaction
      .selectFrom('sales')
      .selectAll()
      .where('requestId', '=', data.requestId)
      .executeTakeFirst()
    if (existing) {
      if (existing.cashierId !== accountId)
        throw new SalesError('This checkout reference is already in use.')
      const lines = await transaction
        .selectFrom('saleItems')
        .selectAll()
        .where('saleId', '=', existing.id)
        .execute()
      if (
        existing.customerId !== data.customerId ||
        (data.walkInDiscount
          ? existing.discountType !== data.walkInDiscount.discountType ||
            existing.discountId !== data.walkInDiscount.discountId.trim() ||
            existing.customerName !== data.walkInDiscount.holderName.trim()
          : existing.customerId === null && existing.discountType !== 'none') ||
        existing.cashCents !== data.cashCents ||
        existing.paymentMethod !== data.paymentMethod ||
        existing.totalCents !== data.expectedTotalCents ||
        lines.length !== data.items.length ||
        !lines.every((line) =>
          data.items.some(
            (item) =>
              item.batchId === line.batchId &&
              item.quantity === line.quantity &&
              (item.unit ?? 'piece') === line.unit &&
              item.unitPriceCents === line.unitPriceCents
          )
        )
      )
        throw new SalesError('Checkout reference belongs to a different transaction.')
      return existing.id
    }
    const prepared = await prepare(transaction, {
      customerId: data.customerId,
      walkInDiscount: data.walkInDiscount,
      items: data.items
    })
    if (prepared.totals.totalCents !== data.expectedTotalCents)
      throw new SalesError(
        'The total or customer eligibility changed. Review the updated total before paying.'
      )
    if (data.cashCents < prepared.totals.totalCents)
      throw new SalesError('Cash received is less than the total due.')
    // Note: An e-wallet transfer is for the exact amount, so it gives no change.
    if (data.paymentMethod !== 'Cash' && data.cashCents !== prepared.totals.totalCents)
      throw new SalesError(`${data.paymentMethod} payments must be for the exact total due.`)
    if (data.paymentMethod !== 'Cash') {
      const duplicate = await transaction
        .selectFrom('sales')
        .select('id')
        .where('paymentMethod', '=', data.paymentMethod)
        .where('paymentReference', '=', data.paymentReference)
        .executeTakeFirst()
      if (duplicate)
        throw new SalesError(`That ${data.paymentMethod} reference has already been recorded.`)
    }
    const rx = prepared.prescription
    if (rx.required.length) {
      if (!data.prescription)
        throw new SalesError(
          `Enter the prescription details for ${rx.required.join(', ')} (prescription required).`
        )
      if (rx.controlled.length) {
        const missing = missingRegisterFields(
          data.prescription,
          data.customerId !== null || !!data.walkInDiscount
        )
        if (missing.length)
          throw new SalesError(
            `${rx.controlled.join(', ')} is a controlled (dangerous) drug. Enter the ${missing.join(', ')} for the dangerous drugs register.`
          )
      }
    }
    const prescription = rx.required.length ? data.prescription : null
    const register = rx.controlled.length ? data.prescription : null
    const reference = `SALE-${randomUUID().toUpperCase()}`
    const sale = await transaction
      .insertInto('sales')
      .values({
        requestId: data.requestId,
        reference,
        cashierId: accountId,
        cashierName: account.fullName,
        customerId: data.customerId,
        // Note: A walk-in buying a controlled drug is recorded under the patient's name.
        customerName:
          data.customerId === null && !data.walkInDiscount && register?.patientName
            ? register.patientName
            : prepared.customerName,
        discountId: prepared.discountId,
        discountExpiresAt: prepared.discountExpiresAt,
        ...prepared.totals,
        cashCents: data.cashCents,
        changeCents: data.cashCents - prepared.totals.totalCents,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentMethod === 'Cash' ? null : data.paymentReference,
        prescriberName: prescription?.prescriberName ?? null,
        prescriberLicense: prescription?.prescriberLicense ?? null,
        prescriptionNumber: prescription?.prescriptionNumber || null,
        patientAge: register?.patientAge ?? null,
        patientAddress: register?.patientAddress || null,
        prescriberAddress: register?.prescriberAddress || null,
        prescriberS2License: register?.prescriberS2License || null,
        status: 'completed',
        voidedAt: null,
        voidedBy: null,
        voidedByName: null,
        voidApprovedByName: null,
        voidReason: null,
        createdAt: new Date().toISOString()
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    for (const item of prepared.items) {
      await deductBatchStock(
        transaction,
        {
          batchId: item.batchId,
          quantity: item.quantity * item.piecesPerUnit,
          reason: `Sale ${reference}`,
          kind: 'sale'
        },
        accountId
      )
      await transaction
        .insertInto('saleItems')
        .values({ ...item, saleId: sale.id })
        .executeTakeFirstOrThrow()
    }
    return sale.id
  })
  return getSale(id, accountId)
}

/**
 * Checks an administrator's username and password typed at the counter to approve a void. Wrong
 * passwords count toward that account's sign-in lock, exactly like a failed sign-in.
 */
async function approveAsAdministrator(username: string, password: string): Promise<string> {
  const account = await db
    .selectFrom('accounts')
    .selectAll()
    .where('username', '=', username.trim())
    .executeTakeFirst()
  const refused = new SalesError('Administrator username or password is incorrect.')
  if (!account || account.role !== 'master' || account.isArchived || !account.isVerified)
    throw refused
  if (isLocked(account))
    throw new SalesError('That administrator account is locked for a minute after failed attempts.')
  if (!(await verify(account.password, password))) {
    const now = Date.now()
    const reset =
      !account.lastFailedAt ||
      (account.lockedUntil && Date.parse(account.lockedUntil) <= now) ||
      now - Date.parse(account.lastFailedAt) > LOGIN_WINDOW_MS
    const count = reset ? 1 : account.failedAttempts + 1
    await db
      .updateTable('accounts')
      .set({
        failedAttempts: count,
        lastFailedAt: new Date(now).toISOString(),
        lockedUntil: count >= LOGIN_MAX_ATTEMPTS ? new Date(now + LOGIN_LOCK_MS).toISOString() : null
      })
      .where('id', '=', account.id)
      .execute()
    throw refused
  }
  await db
    .updateTable('accounts')
    .set({ failedAttempts: 0, lastFailedAt: null, lockedUntil: null })
    .where('id', '=', account.id)
    .execute()
  return account.fullName
}

/**
 * Voids a whole retail sale that was rung up wrong. Medicines are not returned or refunded; a
 * void only undoes a sale entry: each line's pieces go back to the batch they came from, the sale
 * stays in history marked VOID and is left out of totals. An administrator voids directly; anyone
 * else needs an administrator to type their username and password at the counter.
 */
export async function voidSale(
  input: VoidSale,
  actor: { id: number; fullName: string; role: string },
  visibleTo?: number
): Promise<SaleRecord> {
  const data = voidSaleSchema.parse(input)
  let approver = actor.fullName
  if (actor.role !== 'master') {
    if (!data.approval)
      throw new SalesError('An administrator must approve this void with their username and password.')
    approver = await approveAsAdministrator(data.approval.username, data.approval.password)
  }
  await db.transaction().execute(async (transaction) => {
    let query = transaction.selectFrom('sales').selectAll().where('id', '=', data.saleId)
    if (visibleTo !== undefined) query = query.where('cashierId', '=', visibleTo)
    const sale = await query.executeTakeFirst()
    if (!sale) throw new SalesError('Transaction not found or access denied.')
    if (sale.status === 'voided') throw new SalesError('This sale is already voided.')
    const items = await transaction
      .selectFrom('saleItems')
      .selectAll()
      .where('saleId', '=', sale.id)
      .execute()
    for (const item of items)
      await transaction
        .updateTable('batches')
        .set((eb) => ({ currentStock: eb('currentStock', '+', item.quantity * item.piecesPerUnit) }))
        .where('id', '=', item.batchId)
        .executeTakeFirstOrThrow()
    await transaction
      .updateTable('sales')
      .set({
        status: 'voided',
        voidedAt: new Date().toISOString(),
        voidedBy: actor.id,
        voidedByName: actor.fullName,
        voidApprovedByName: approver,
        voidReason: data.reason
      })
      .where('id', '=', sale.id)
      .where('status', '=', 'completed')
      .executeTakeFirstOrThrow()
    noteAudit({
      summary: `Voided ${sale.reference} (${(sale.totalCents / 100).toFixed(2)} PHP, ${items.length} line(s)); stock returned to the original batches. Approved by ${approver}.`,
      reason: data.reason,
      changes: [{ field: 'Status', from: 'completed', to: 'voided' }]
    })
  })
  return getSale(data.saleId)
}

/** Cash sales of one cashier today, for the end-of-day drawer count. */
export async function cashCountPreview(cashierId: number): Promise<CashCountPreview> {
  const { start, end } = dateBounds(localDate(), localDate())
  const rows = await db
    .selectFrom('sales')
    .select(['paymentMethod', 'status', 'totalCents'])
    .where('cashierId', '=', cashierId)
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .execute()
  const completed = rows.filter((row) => row.status === 'completed')
  const cash = completed.filter((row) => row.paymentMethod === 'Cash')
  return {
    businessDate: localDate(),
    cashSalesCents: cash.reduce((sum, row) => sum + row.totalCents, 0),
    cashSalesCount: cash.length,
    ewalletSalesCents: completed
      .filter((row) => row.paymentMethod !== 'Cash')
      .reduce((sum, row) => sum + row.totalCents, 0),
    voidedCount: rows.length - completed.length
  }
}

const toCashCount = (
  row: Omit<CashCountRecord, 'denominations'> & { denominations: string }
): CashCountRecord => ({ ...row, denominations: JSON.parse(row.denominations) })

/**
 * Saves the cashier's closing count. Expected cash = opening float + today's completed cash sales
 * (cash received minus change, i.e. the sale totals); the difference is over (+) or short (−).
 */
export async function recordCashCount(
  input: CashCountInput,
  cashier: { id: number; fullName: string }
): Promise<CashCountRecord> {
  const data = cashCountSchema.parse(input)
  const preview = await cashCountPreview(cashier.id)
  const counted = countedCents(data.denominations)
  const expected = data.openingFloatCents + preview.cashSalesCents
  const record = await db
    .insertInto('cashCounts')
    .values({
      cashierId: cashier.id,
      cashierName: cashier.fullName,
      businessDate: preview.businessDate,
      openingFloatCents: data.openingFloatCents,
      cashSalesCents: preview.cashSalesCents,
      cashSalesCount: preview.cashSalesCount,
      expectedCents: expected,
      countedCents: counted,
      differenceCents: counted - expected,
      denominations: JSON.stringify(data.denominations),
      notes: data.notes || null,
      countedByName: cashier.fullName,
      createdAt: new Date().toISOString()
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  noteAudit({
    summary: `Cash count ${preview.businessDate}: counted ${(counted / 100).toFixed(2)}, expected ${(expected / 100).toFixed(2)} (${overShortLabel(counted - expected)} ${(Math.abs(counted - expected) / 100).toFixed(2)})`,
    reason: data.notes || undefined
  })
  return toCashCount(record)
}

export async function findCashCounts(
  from: string,
  to: string,
  cashierId?: number
): Promise<CashCountRecord[]> {
  let query = db
    .selectFrom('cashCounts')
    .selectAll()
    .where('businessDate', '>=', from)
    .where('businessDate', '<=', to)
    .orderBy('id', 'desc')
    .limit(500)
  if (cashierId !== undefined) query = query.where('cashierId', '=', cashierId)
  return (await query.execute()).map(toCashCount)
}
