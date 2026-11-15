import { noteAudit } from '@main/audit/repository'
import { db } from '@main/db'
import {
  countLinesSchema,
  startCountSchema,
  type StockCountDetails,
  type StockCountRecord,
  type DrugRegister,
  type RegisterEntry
} from '@shared/controls'
import { dateBounds } from '@shared/reporting'
import { escapeHtml } from '@shared/receipt'
import { sql } from 'kysely'
import { csvCell } from './repository'

/**
 * Physical stock counts and the dangerous drugs register.
 *
 * A count snapshots every batch with stock. Staff print the count sheet, count the shelves, and
 * enter what they found. Completing the count adjusts each batch by (counted − expected), up or
 * down, with the reason given, so sales made while counting are not lost.
 */

const sqliteToIso = (value: string): string =>
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value

async function countSummaries(id?: number): Promise<StockCountRecord[]> {
  const rows = await sql<{
    id: number
    status: StockCountRecord['status']
    notes: string | null
    startedAt: string
    closedAt: string | null
    startedByName: string
    closedByName: string | null
    productName: string | null
    lineCount: number
    countedCount: number
    differenceCount: number
  }>`SELECT c.id, c.status, c.notes, c.started_at, c.closed_at, s.full_name AS started_by_name, x.full_name AS closed_by_name,
    CASE WHEN d.id IS NULL THEN NULL ELSE d.brand_name || ' (' || d.generic_name || ') ' || d.formulation END AS product_name,
    (SELECT COUNT(*) FROM stock_count_lines WHERE count_id = c.id) AS line_count,
    (SELECT COUNT(*) FROM stock_count_lines WHERE count_id = c.id AND counted IS NOT NULL) AS counted_count,
    (SELECT COUNT(*) FROM stock_count_lines WHERE count_id = c.id AND counted IS NOT NULL AND counted != expected) AS difference_count
    FROM stock_counts c JOIN accounts s ON s.id = c.started_by LEFT JOIN accounts x ON x.id = c.closed_by LEFT JOIN drugs d ON d.id = c.drug_id
    ${id ? sql`WHERE c.id = ${id}` : sql``} ORDER BY c.id DESC LIMIT 100`.execute(db)
  return rows.rows.map(({ productName, ...row }) => ({
    ...row,
    scope: productName ?? 'All products with stock',
    lineCount: Number(row.lineCount),
    countedCount: Number(row.countedCount),
    differenceCount: Number(row.differenceCount)
  }))
}

export const listCounts = (): Promise<StockCountRecord[]> => countSummaries()

export async function getCount(id: number): Promise<StockCountDetails> {
  const [summary] = await countSummaries(id)
  if (!summary) throw new Error('Stock count not found.')
  const lines = await db
    .selectFrom('stockCountLines')
    .innerJoin('batches', 'batches.id', 'stockCountLines.batchId')
    .innerJoin('drugs', 'drugs.id', 'batches.drugId')
    .select([
      'stockCountLines.batchId',
      'stockCountLines.expected',
      'stockCountLines.counted',
      'stockCountLines.reason',
      'batches.physicalTag',
      'batches.expiresAt',
      'batches.piecesPerBox',
      'batches.currentStock',
      'batches.buyPrice',
      'drugs.brandName',
      'drugs.genericName',
      'drugs.formulation'
    ])
    .where('stockCountLines.countId', '=', id)
    .orderBy('drugs.brandName')
    .orderBy('batches.expiresAt')
    .execute()
  return {
    ...summary,
    lines: lines.map((line) => ({
      batchId: line.batchId,
      productName: `${line.brandName} (${line.genericName}) ${line.formulation}`,
      batchNumber: line.physicalTag ?? `Batch ${line.batchId}`,
      expiresAt: String(line.expiresAt),
      piecesPerBox: line.piecesPerBox,
      expected: line.expected,
      counted: line.counted,
      reason: line.reason,
      currentStock: line.currentStock,
      unitCost: line.buyPrice
    }))
  }
}

export async function startCount(input: unknown, accountId: number): Promise<number> {
  const data = startCountSchema.parse(input)
  return db.transaction().execute(async (transaction) => {
    const open = await transaction
      .selectFrom('stockCounts')
      .select('id')
      .where('status', '=', 'open')
      .executeTakeFirst()
    if (open)
      throw new Error(`Stock count #${open.id} is still open. Complete or cancel it before starting another.`)
    // Note: A one-product count lists all its batches, including ones the system shows as empty,
    // so stock found on the shelf can be added back. A full count lists every batch with stock.
    let query = transaction.selectFrom('batches').select(['id', 'currentStock'])
    query = data.drugId
      ? query.where('drugId', '=', data.drugId)
      : query.where('currentStock', '>', 0)
    const rows = await query.orderBy('id').execute()
    if (!rows.length) throw new Error('There are no batches to count.')
    const count = await transaction
      .insertInto('stockCounts')
      .values({
        drugId: data.drugId,
        notes: data.notes || null,
        startedBy: accountId,
        startedAt: new Date().toISOString()
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await transaction
      .insertInto('stockCountLines')
      .values(rows.map((row) => ({ countId: count.id, batchId: row.id, expected: row.currentStock })))
      .execute()
    noteAudit({ summary: `Started stock count #${count.id} of ${rows.length} batch(es)` })
    return count.id
  })
}

export async function recordCountLines(input: unknown): Promise<void> {
  const data = countLinesSchema.parse(input)
  await db.transaction().execute(async (transaction) => {
    const count = await transaction
      .selectFrom('stockCounts')
      .select('status')
      .where('id', '=', data.countId)
      .executeTakeFirst()
    if (!count) throw new Error('Stock count not found.')
    if (count.status !== 'open') throw new Error('This stock count is closed.')
    for (const line of data.lines) {
      const result = await transaction
        .updateTable('stockCountLines')
        .set({ counted: line.counted, reason: line.reason || null })
        .where('countId', '=', data.countId)
        .where('batchId', '=', line.batchId)
        .executeTakeFirst()
      if (Number(result.numUpdatedRows) !== 1)
        throw new Error('A batch on the sheet does not belong to this count.')
    }
  })
}

/** Applies every difference at once: stock goes up or down to what was counted. */
export async function completeCount(id: number, accountId: number): Promise<number> {
  const count = await getCount(id)
  if (count.status !== 'open') throw new Error('This stock count is closed.')
  const missing = count.lines.filter((line) => line.counted === null)
  if (missing.length)
    throw new Error(
      `Enter the counted quantity for every batch (${missing.length} left, e.g. ${missing[0].productName} batch ${missing[0].batchNumber}). Enter 0 if none were found.`
    )
  const differences = count.lines.filter((line) => line.counted !== line.expected)
  const unexplained = differences.find((line) => (line.reason ?? '').trim().length < 3)
  if (unexplained)
    throw new Error(
      `Give a reason for the difference on ${unexplained.productName} batch ${unexplained.batchNumber} (expected ${unexplained.expected}, counted ${unexplained.counted}).`
    )
  await db.transaction().execute(async (transaction) => {
    const now = new Date().toISOString()
    for (const line of differences) {
      const change = line.counted! - line.expected
      const batch = await transaction
        .selectFrom('batches')
        .select('currentStock')
        .where('id', '=', line.batchId)
        .executeTakeFirstOrThrow()
      if (batch.currentStock + change < 0)
        throw new Error(
          `${line.productName} batch ${line.batchNumber}: ${-change} piece(s) cannot be removed because only ${batch.currentStock} are left after sales made during the count. Recount this batch.`
        )
      await transaction
        .updateTable('batches')
        .set((eb) => ({ currentStock: eb('currentStock', '+', change) }))
        .where('id', '=', line.batchId)
        .execute()
      await transaction
        .insertInto('stockAdjustments')
        .values({
          batchId: line.batchId,
          change,
          reason: line.reason!.trim(),
          countId: id,
          recordedBy: accountId,
          createdAt: now
        })
        .execute()
    }
    await transaction
      .updateTable('stockCounts')
      .set({ status: 'completed', closedBy: accountId, closedAt: now })
      .where('id', '=', id)
      .where('status', '=', 'open')
      .executeTakeFirstOrThrow()
  })
  noteAudit({
    summary: `Completed stock count #${id}: ${count.lines.length} batch(es) counted, ${differences.length} adjusted`,
    changes: differences.map((line) => ({
      field: `${line.productName} batch ${line.batchNumber} (${line.reason})`,
      from: line.expected,
      to: line.counted
    }))
  })
  return id
}

export async function cancelCount(id: number, accountId: number): Promise<void> {
  const result = await db
    .updateTable('stockCounts')
    .set({ status: 'cancelled', closedBy: accountId, closedAt: new Date().toISOString() })
    .where('id', '=', id)
    .where('status', '=', 'open')
    .executeTakeFirst()
  if (Number(result.numUpdatedRows) !== 1) throw new Error('Only an open stock count can be cancelled.')
  noteAudit({ summary: `Cancelled stock count #${id}; no stock was changed` })
}

const page = (title: string, body: string, landscape = false): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; font-size: 10px; }
  h1 { font-size: 16px; margin: 0 0 2px; } .meta { color: #4b5563; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; } th { background: #eef2f7; text-align: left; }
  th, td { border: 1px solid #9ca3af; padding: 4px 5px; vertical-align: top; } tr { break-inside: avoid; }
  thead { display: table-header-group; } .num { text-align: right; } .blank { min-width: 70px; }
  .sign { margin-top: 18px; display: flex; gap: 40px; } .sign span { border-top: 1px solid #111; padding-top: 2px; min-width: 200px; }
  </style></head><body>${body}</body></html>`

/** Printable count sheet: expected quantities and blank columns to write the actual count. */
export function countSheetHtml(count: StockCountDetails): string {
  const rows = count.lines
    .map(
      (line, index) =>
        `<tr><td class="num">${index + 1}</td><td>${escapeHtml(line.productName)}</td><td>${escapeHtml(line.batchNumber)}</td><td>${escapeHtml(line.expiresAt)}</td><td class="num">${line.piecesPerBox > 1 ? `${line.piecesPerBox} pcs` : 'pieces'}</td><td class="num">${line.expected}</td><td class="blank"></td><td class="blank"></td></tr>`
    )
    .join('')
  return page(
    `Stock count #${count.id}`,
    `<h1>Med Prix · Stock count sheet #${count.id}</h1>
<p class="meta">${escapeHtml(count.scope)} · Started ${escapeHtml(new Date(count.startedAt).toLocaleString('en-PH'))} by ${escapeHtml(count.startedByName)}. Count every piece on the shelf, including open boxes. Write differences' reasons in Notes.</p>
<table><thead><tr><th>#</th><th>Product</th><th>Batch</th><th>Expiry</th><th>Box size</th><th>Expected (pcs)</th><th>Counted (pcs)</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sign"><span>Counted by / date</span><span>Checked by / date</span></div>`
  )
}

// Dangerous drugs register ---------------------------------------------------------------------

const localDay = (iso: string): string => {
  const value = new Date(iso)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

/**
 * Every movement of one product with a running balance, laid out like the drugstore register of
 * DDB Board Regulation No. 1 s.2014 (Annex I, form 1-14): IN (date, supplier, quantity), OUT (date,
 * patient name/age/address, prescription no., S2 no., practitioner, quantity), balance, remarks.
 * Built from the saved deliveries, sales, voids, wholesale deliveries, write-offs, supplier returns
 * and count adjustments, so it always agrees with them.
 */
export async function drugRegister(drugId: number, from: string, to: string): Promise<DrugRegister> {
  const drug = await db.selectFrom('drugs').selectAll().where('id', '=', drugId).executeTakeFirst()
  if (!drug) throw new Error('Product not found.')
  const received = await sql<{
    at: string
    batch: string
    pieces: number
    supplier: string
    address: string
    license: string | null
    orderNumber: string
    invoices: string | null
    deliveredBy: string | null
  }>`SELECT d.delivered_at AS at, COALESCE(b.physical_tag, 'Batch ' || b.id) AS batch, i.quantity * i.pieces_per_unit AS pieces,
    s.organization AS supplier, s.street || ', ' || s.city || ', ' || s.province AS address, s.pdea_license AS license, po.order_number,
    (SELECT GROUP_CONCAT(invoice_number, ', ') FROM supplier_invoices WHERE purchase_order_id = po.id) AS invoices, d.delivered_by_name AS delivered_by
    FROM supplier_delivery_items i JOIN supplier_deliveries d ON d.id = i.delivery_id JOIN batches b ON b.id = i.batch_id
    JOIN suppliers s ON s.id = d.supplier_id JOIN purchase_orders po ON po.id = d.purchase_order_id WHERE i.drug_id = ${drugId}`.execute(
    db
  )
  const sold = await sql<{
    at: string
    voidedAt: string | null
    voidReason: string | null
    status: string
    reference: string
    batch: string
    pieces: number
    patient: string
    age: number | null
    address: string | null
    rx: string | null
    s2: string | null
    doctor: string | null
    doctorAddress: string | null
    license: string | null
    cashier: string
  }>`SELECT s.created_at AS at, s.voided_at, s.void_reason, s.status, s.reference, i.batch_number AS batch, i.quantity * i.pieces_per_unit AS pieces,
    s.customer_name AS patient, s.patient_age AS age, s.patient_address AS address, s.prescription_number AS rx, s.prescriber_s2_license AS s2,
    s.prescriber_name AS doctor, s.prescriber_address AS doctor_address, s.prescriber_license AS license, s.cashier_name AS cashier
    FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE i.drug_id = ${drugId}`.execute(db)
  const wholesale = await sql<{
    at: string
    reference: string
    batch: string
    pieces: number
    client: string
    address: string
    receivedBy: string | null
  }>`SELECT w.delivered_at AS at, w.reference, i.batch_number AS batch, i.quantity * i.pieces_per_unit AS pieces, w.customer_name AS client,
    w.delivery_address AS address, w.received_by_name AS received_by
    FROM wholesale_order_items i JOIN wholesale_orders w ON w.id = i.order_id WHERE i.drug_id = ${drugId} AND w.status = 'delivered'`.execute(
    db
  )
  const removed = await sql<{
    at: string
    kind: 'write_off' | 'supplier_return'
    batch: string
    pieces: number
    reason: string
  }>`SELECT o.created_at AS at, o.kind, COALESCE(b.physical_tag, 'Batch ' || b.id) AS batch, o.quantity AS pieces, o.reason
    FROM stock_outs o JOIN batches b ON b.id = o.batch_id WHERE b.drug_id = ${drugId} AND o.kind IN ('write_off', 'supplier_return')`.execute(
    db
  )
  const adjusted = await sql<{ at: string; batch: string; change: number; reason: string; countId: number | null }>`
    SELECT a.created_at AS at, COALESCE(b.physical_tag, 'Batch ' || b.id) AS batch, a.change, a.reason, a.count_id
    FROM stock_adjustments a JOIN batches b ON b.id = a.batch_id WHERE b.drug_id = ${drugId}`.execute(db)
  const stock = await db
    .selectFrom('batches')
    .select((eb) => eb.fn.sum<number>('currentStock').as('pieces'))
    .where('drugId', '=', drugId)
    .executeTakeFirstOrThrow()

  const blank = { supplier: null, patient: null, prescriptionNumber: null, s2License: null, practitioner: null }
  const all: Omit<RegisterEntry, 'balance'>[] = [
    ...received.rows.map((row) => ({
      ...blank,
      at: new Date(`${row.at}T00:00:00`).toISOString(),
      kind: 'received' as const,
      batchNumber: row.batch,
      quantityIn: Number(row.pieces),
      quantityOut: 0,
      supplier: `${row.supplier}, ${row.address}${row.license ? ` · PDEA/LTO ${row.license}` : ' · PDEA license not recorded'}`,
      reference: row.orderNumber,
      remarks: `Received${row.invoices ? `, invoice ${row.invoices}` : ''}${row.deliveredBy ? `, delivered by ${row.deliveredBy}` : ''}`
    })),
    ...sold.rows.flatMap((row) => {
      const out = {
        ...blank,
        at: row.at,
        kind: 'dispensed' as const,
        batchNumber: row.batch,
        quantityIn: 0,
        quantityOut: Number(row.pieces),
        patient: [row.patient, row.age !== null ? `${row.age} yrs` : null, row.address].filter(Boolean).join(', '),
        prescriptionNumber: row.rx,
        s2License: row.s2,
        practitioner: row.doctor
          ? [row.doctor, row.license ? `PRC ${row.license}` : null, row.doctorAddress].filter(Boolean).join(', ')
          : null,
        reference: row.reference,
        remarks: `Dispensed by ${row.cashier}`
      }
      return row.status === 'voided' && row.voidedAt
        ? [
            out,
            {
              ...blank,
              at: row.voidedAt,
              kind: 'void' as const,
              batchNumber: row.batch,
              quantityIn: Number(row.pieces),
              quantityOut: 0,
              reference: row.reference,
              remarks: `Sale voided, returned to stock: ${row.voidReason ?? ''}`
            }
          ]
        : [out]
    }),
    ...wholesale.rows.map((row) => ({
      ...blank,
      at: row.at,
      kind: 'wholesale' as const,
      batchNumber: row.batch,
      quantityIn: 0,
      quantityOut: Number(row.pieces),
      patient: `${row.client} (pharmacy), ${row.address}`,
      reference: row.reference,
      remarks: `Wholesale delivery${row.receivedBy ? `, received by ${row.receivedBy}` : ''}`
    })),
    ...removed.rows.map((row) => ({
      ...blank,
      at: sqliteToIso(row.at),
      kind: row.kind,
      batchNumber: row.batch,
      quantityIn: 0,
      quantityOut: Number(row.pieces),
      reference: row.kind === 'supplier_return' ? 'Return to supplier' : 'Write-off',
      remarks: row.reason
    })),
    ...adjusted.rows.map((row) => ({
      ...blank,
      at: row.at,
      kind: 'count' as const,
      batchNumber: row.batch,
      quantityIn: Math.max(0, row.change),
      quantityOut: Math.max(0, -row.change),
      reference: row.countId ? `Stock count #${row.countId}` : 'Stock adjustment',
      remarks: row.reason
    }))
  ].sort((a, b) => a.at.localeCompare(b.at))

  const { start, end } = dateBounds(from, to)
  let balance = 0
  let openingBalance = 0
  const entries: RegisterEntry[] = []
  for (const entry of all) {
    balance += entry.quantityIn - entry.quantityOut
    if (entry.at < start) openingBalance = balance
    else if (entry.at < end) entries.push({ ...entry, balance })
  }
  const stockOnHand = Number(stock.pieces ?? 0)
  return {
    drugId,
    productName: `${drug.brandName} (${drug.genericName}) ${drug.formulation}`,
    isControlled: drug.isControlled === 1,
    from,
    to,
    openingBalance,
    closingBalance: entries.at(-1)?.balance ?? openingBalance,
    stockOnHand,
    unexplained: stockOnHand - balance,
    entries
  }
}

const kindLabel: Record<RegisterEntry['kind'], string> = {
  received: 'Received',
  dispensed: 'Dispensed',
  void: 'Void (back to stock)',
  wholesale: 'Wholesale',
  write_off: 'Write-off',
  supplier_return: 'Returned to supplier',
  count: 'Stock count'
}

export function registerHtml(register: DrugRegister, preparedBy: string): string {
  const cell = (value: string | number | null | undefined): string =>
    value === null || value === undefined || value === '' || value === 0 ? '' : escapeHtml(String(value))
  const rows = register.entries
    .map((entry) => {
      const date = localDay(entry.at)
      return `<tr><td>${entry.quantityIn ? date : ''}</td><td>${cell(entry.supplier)}</td><td class="num">${cell(entry.quantityIn)}</td>
<td>${entry.quantityOut ? date : ''}</td><td>${cell(entry.patient)}</td><td>${cell(entry.prescriptionNumber)}</td><td>${cell(entry.s2License)}</td><td>${cell(entry.practitioner)}</td>
<td class="num">${cell(entry.quantityOut)}</td><td class="num">${entry.balance}</td><td>${escapeHtml(`${kindLabel[entry.kind]} · ${entry.reference} · batch ${entry.batchNumber}${entry.remarks ? ` · ${entry.remarks}` : ''}`)}</td></tr>`
    })
    .join('')
  return page(
    `Dangerous drugs register ${register.productName}`,
    `<h1>Med Prix · Dangerous Drugs Register (drugstore)</h1>
<p class="meta"><b>${escapeHtml(register.productName)}</b> · ${escapeHtml(register.from)} to ${escapeHtml(register.to)} · Generated ${escapeHtml(new Date().toLocaleString('en-PH'))} by ${escapeHtml(preparedBy)}.
Layout follows DDB Board Regulation No. 1 s.2014, Annex I, form 1-14. Quantities are in pieces.</p>
<table><thead><tr><th colspan="3">IN</th><th colspan="6">OUT</th><th rowspan="2">Balance</th><th rowspan="2">Remarks</th></tr>
<tr><th>Date received</th><th>Supplier (name, address, PDEA license)</th><th>Qty received</th><th>Date dispensed</th><th>Patient (name, age, address)</th><th>SPFDD / Rx no.</th><th>S2 license no.</th><th>Practitioner (name, address)</th><th>Qty dispensed</th></tr></thead>
<tbody><tr><td colspan="9"><b>Balance forwarded</b></td><td class="num"><b>${register.openingBalance}</b></td><td></td></tr>${rows}
<tr><td colspan="9"><b>Closing balance</b></td><td class="num"><b>${register.closingBalance}</b></td><td>${register.unexplained ? `Stock on hand is ${register.stockOnHand}; ${register.unexplained} piece(s) were on hand before movements were recorded.` : ''}</td></tr></tbody></table>
<div class="sign"><span>Pharmacist on duty (signature over printed name)</span><span>PRC license no.</span></div>`,
    true
  )
}

export function registerCsv(register: DrugRegister): string {
  const rows: unknown[][] = [
    ['Dangerous drugs register', register.productName],
    ['Period', register.from, register.to],
    [],
    [
      'Date / time',
      'Movement',
      'Reference',
      'Batch',
      'Supplier',
      'Qty in',
      'Patient (name, age, address)',
      'SPFDD / Rx no.',
      'S2 license no.',
      'Practitioner',
      'Qty out',
      'Balance',
      'Remarks'
    ],
    ['', 'Balance forwarded', '', '', '', '', '', '', '', '', '', register.openingBalance, ''],
    ...register.entries.map((entry) => [
      entry.at,
      kindLabel[entry.kind],
      entry.reference,
      entry.batchNumber,
      entry.supplier ?? '',
      entry.quantityIn || '',
      entry.patient ?? '',
      entry.prescriptionNumber ?? '',
      entry.s2License ?? '',
      entry.practitioner ?? '',
      entry.quantityOut || '',
      entry.balance,
      entry.remarks
    ])
  ]
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
