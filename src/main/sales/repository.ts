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
import { LOGIN_LOCK_MS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from '@shared/security'
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
import { sql, type Kysely } from 'kysely'
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
        // Note: A voided sale's reference may be rung up again on the corrected sale (M4).
        .where('status', '=', 'completed')
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
        // Note: A dangerous-drug (S2) prescription is filled once (L10). Register sales are the
        // ones with the doctor's S2 number; a voided sale does not count as filled.
        const filled = await transaction
          .selectFrom('sales')
          .select(['reference', 'createdAt'])
          .where('status', '=', 'completed')
          .where('prescriberS2License', 'is not', null)
          .where(
            sql<string>`lower(trim(prescription_number))`,
            '=',
            data.prescription!.prescriptionNumber.trim().toLowerCase()
          )
          .executeTakeFirst()
        if (filled)
          throw new SalesError(
            `Prescription ${data.prescription!.prescriptionNumber.trim()} was already filled on ${new Date(filled.createdAt).toLocaleDateString('en-PH')} (${filled.reference}). A dangerous-drug prescription is filled once; ask for a new prescription.`
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
        voidItemsReturned: null,
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

// Note: Wrong approvals are limited per person asking, not on the administrator's account, so a
// cashier cannot lock the administrator out of sign-in by guessing here (L4). Five wrong tries in
// the sign-in window block that person's approvals for the sign-in lock time.
const approvalFailures = new Map<number, { count: number; last: number; lockedUntil: number }>()

/**
 * Checks an administrator's username and password typed at the counter to approve a void. The
 * username is matched without letter case, like sign-in (L3).
 */
async function approveAsAdministrator(
  username: string,
  password: string,
  requestedBy: number
): Promise<string> {
  const now = Date.now()
  const failures = approvalFailures.get(requestedBy)
  if (failures && failures.lockedUntil > now)
    throw new SalesError('Too many wrong approvals. Wait a minute, then ask the administrator again.')
  const account = await db
    .selectFrom('accounts')
    .selectAll()
    .where('username', '=', username.trim().toLowerCase())
    .executeTakeFirst()
  const valid =
    !!account &&
    account.role === 'master' &&
    !account.isArchived &&
    !!account.isVerified &&
    (await verify(account.password, password))
  if (!valid) {
    const count = failures && now - failures.last <= LOGIN_WINDOW_MS ? failures.count + 1 : 1
    if (approvalFailures.size >= 1000) approvalFailures.delete(approvalFailures.keys().next().value!)
    approvalFailures.set(requestedBy, {
      count,
      last: now,
      lockedUntil: count >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_LOCK_MS : 0
    })
    throw new SalesError('Administrator username or password is incorrect.')
  }
  approvalFailures.delete(requestedBy)
  return account.fullName
}

/**
 * Voids a whole retail sale that was rung up wrong. The sale stays in history marked VOID and is
 * left out of totals. An administrator voids directly; anyone else needs an administrator to type
 * their username and password at the counter.
 *
 * - Only a sale of today can be voided, and only before its cashier's cash count for the day
 *   (M2), so a closed day never changes. Older mistakes are corrected with a write-off or a stock
 *   count, which are dated today.
 * - If the medicines came back to the counter they go back to the batch they came from. If the
 *   customer kept them, the stock is written off as lost with the sale's reference (M3), so the
 *   shelf, the losses report and the dangerous drugs register stay right.
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
    approver = await approveAsAdministrator(
      data.approval.username,
      data.approval.password,
      actor.id
    )
  }
  await db.transaction().execute(async (transaction) => {
    let query = transaction.selectFrom('sales').selectAll().where('id', '=', data.saleId)
    if (visibleTo !== undefined) query = query.where('cashierId', '=', visibleTo)
    const sale = await query.executeTakeFirst()
    if (!sale) throw new SalesError('Transaction not found or access denied.')
    if (sale.status === 'voided') throw new SalesError('This sale is already voided.')
    const saleDay = localDate(new Date(sale.createdAt))
    if (saleDay !== localDate())
      throw new SalesError(
        `Only today's sales can be voided. This sale is from ${saleDay}, a day that is already closed. Correct the stock with a write-off or a stock count instead.`
      )
    const counted = await transaction
      .selectFrom('cashCounts')
      .select('id')
      .where('cashierId', '=', sale.cashierId)
      .where('businessDate', '=', saleDay)
      .where('createdAt', '>', sale.createdAt)
      .executeTakeFirst()
    if (counted)
      throw new SalesError(
        `${sale.cashierName}'s cash drawer for today was already counted after this sale, so it can no longer be voided.`
      )
    const items = await transaction
      .selectFrom('saleItems')
      .selectAll()
      .where('saleId', '=', sale.id)
      .execute()
    for (const item of items) {
      const pieces = item.quantity * item.piecesPerUnit
      await transaction
        .updateTable('batches')
        .set((eb) => ({ currentStock: eb('currentStock', '+', pieces) }))
        .where('id', '=', item.batchId)
        .executeTakeFirstOrThrow()
      if (!data.itemsReturned)
        await deductBatchStock(
          transaction,
          {
            batchId: item.batchId,
            quantity: pieces,
            kind: 'write_off',
            reasonCode: 'lost',
            reason: `Kept by the customer; sale ${sale.reference} voided`
          },
          actor.id
        )
    }
    await transaction
      .updateTable('sales')
      .set({
        status: 'voided',
        voidedAt: new Date().toISOString(),
        voidedBy: actor.id,
        voidedByName: actor.fullName,
        voidApprovedByName: approver,
        voidReason: data.reason,
        voidItemsReturned: data.itemsReturned ? 1 : 0
      })
      .where('id', '=', sale.id)
      .where('status', '=', 'completed')
      .executeTakeFirstOrThrow()
    noteAudit({
      summary: `Voided ${sale.reference} (${(sale.totalCents / 100).toFixed(2)} PHP, ${items.length} line(s)); ${data.itemsReturned ? 'medicines returned to the original batches' : 'medicines kept by the customer, written off as lost'}. Approved by ${approver}.`,
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
  const previous = await db
    .selectFrom('cashCounts')
    .select('id')
    .where('cashierId', '=', cashierId)
    .where('businessDate', '=', localDate())
    .orderBy('id', 'desc')
    .executeTakeFirst()
  return {
    businessDate: localDate(),
    cashSalesCents: cash.reduce((sum, row) => sum + row.totalCents, 0),
    cashSalesCount: cash.length,
    ewalletSalesCents: completed
      .filter((row) => row.paymentMethod !== 'Cash')
      .reduce((sum, row) => sum + row.totalCents, 0),
    voidedCount: rows.length - completed.length,
    previousCountId: previous?.id ?? null
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
  // Note: The screen asks for these too; the backend checks them so a direct call cannot skip them.
  if (counted !== expected && data.notes.length < 3)
    throw new SalesError('The drawer is over or short. Add a note explaining the difference.')
  const previous = preview.previousCountId === null ? undefined : { id: preview.previousCountId }
  if (previous && data.notes.length < 3)
    throw new SalesError(
      `You already saved a cash count today (#${previous.id}). Say why you are counting again in Notes; the new count replaces it.`
    )
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
      createdAt: new Date().toISOString(),
      recountOf: previous?.id ?? null
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  noteAudit({
    summary: `${previous ? `Recount (replaces #${previous.id}) ` : ''}Cash count ${preview.businessDate}: counted ${(counted / 100).toFixed(2)}, expected ${(expected / 100).toFixed(2)} (${overShortLabel(counted - expected)} ${(Math.abs(counted - expected) / 100).toFixed(2)})`,
    reason: data.notes || undefined
  })
  return toCashCount({ ...record, replacedBy: null })
}

export async function findCashCounts(
  from: string,
  to: string,
  cashierId?: number
): Promise<CashCountRecord[]> {
  let query = db
    .selectFrom('cashCounts')
    .selectAll()
    .select((eb) =>
      eb
        .selectFrom('cashCounts as later')
        .select((inner) => inner.fn.min<number>('later.id').as('id'))
        .whereRef('later.recountOf', '=', 'cashCounts.id')
        .as('replacedBy')
    )
    .where('businessDate', '>=', from)
    .where('businessDate', '<=', to)
    .orderBy('id', 'desc')
    .limit(500)
  if (cashierId !== undefined) query = query.where('cashierId', '=', cashierId)
  return (await query.execute()).map(toCashCount)
}
