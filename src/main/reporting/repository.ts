import { db } from '@main/db'
import { csvCell } from '@main/inventory/repository'
import { expiryLabels, getExpiryStatus, isBatchSellable, localDate } from '@shared/inventory'
import {
  dateBounds,
  reportSchema,
  reportTitles,
  type BusinessReport,
  type ReportColumn,
  type ReportFilter,
  type ReportMetric,
  type ReportRow
} from '@shared/reporting'
import type { Database } from '@shared/types'
import { receivable } from '@shared/wholesale'
import { sql, type Kysely, type RawBuilder } from 'kysely'

const c = (key: string, label: string, format?: ReportColumn['format']): ReportColumn => ({
  key,
  label,
  format
})
const product = { key: 'product', label: 'Product', productLink: true }
const paidAR = sql`COALESCE((SELECT SUM(amount_cents) FROM wholesale_payments WHERE order_id = w.id), 0)`
const owedAP = sql`COALESCE((SELECT ROUND(SUM(received_quantity * unit_cost) * 100) FROM purchase_order_items WHERE purchase_order_id = po.id), 0)`
const paidAP = sql`COALESCE((SELECT ROUND(SUM(amount) * 100) FROM supplier_payments WHERE purchase_order_id = po.id), 0)`
export async function stockValuation(database: Kysely<Database> = db): Promise<number> {
  const result = await sql<{
    value: number
  }>`SELECT COALESCE(SUM(ROUND(current_stock * buy_price * 100)), 0) AS value FROM batches`.execute(
    database
  )
  return Number(result.rows[0].value)
}
function movements(start: string, end: string): RawBuilder<unknown> {
  return sql`SELECT i.drug_id, SUM(i.quantity) AS quantity FROM sale_items i JOIN sales s ON s.id = i.sale_id
    WHERE s.created_at >= ${start} AND s.created_at < ${end} GROUP BY i.drug_id
    UNION ALL SELECT i.drug_id, SUM(i.quantity) FROM wholesale_order_items i JOIN wholesale_orders w ON w.id = i.order_id
    WHERE w.status = 'delivered' AND w.delivered_at >= ${start} AND w.delivered_at < ${end} GROUP BY i.drug_id`
}
interface Definition {
  base: RawBuilder<unknown>
  columns: ReportColumn[]
  notes: string[]
  sums?: Array<{ key: string; label: string; format?: 'money' }>
  sort?: RawBuilder<unknown>
}
function definition(filter: ReportFilter): Definition {
  const { start, end } = dateBounds(filter.from, filter.to)
  const period = sql`s.created_at >= ${start} AND s.created_at < ${end}`
  const retail = sql`SELECT s.id, s.reference, s.created_at, s.customer_name, s.cashier_name,
    s.subtotal_cents, s.vat_exemption_cents, s.discount_cents, s.discount_type, s.total_cents, s.cash_cents, s.change_cents,
    COALESCE((SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id), 0) AS quantity,
    (SELECT GROUP_CONCAT(product_name || ' [batch ' || batch_number || '] × ' || quantity || ' @ PHP ' || printf('%.2f', unit_price_cents / 100.0), '; ') FROM sale_items WHERE sale_id = s.id) AS products,
    s.reference || ' ' || s.customer_name || ' ' || s.cashier_name AS search_text
    FROM sales s WHERE ${period}`
  if (filter.kind === 'sales' || filter.kind === 'discounts')
    return {
      base:
        filter.kind === 'discounts'
          ? sql`SELECT * FROM (${retail}) WHERE discount_type != 'none'`
          : retail,
      columns: [
        c('reference', 'Transaction'),
        c('createdAt', 'Date / time', 'dateTime'),
        c('customerName', 'Customer'),
        c('cashierName', 'Cashier'),
        c('products', 'Products / quantities / prices'),
        c('quantity', 'Units'),
        c('subtotalCents', 'Subtotal', 'money'),
        c('discountType', 'Discount type'),
        c('vatExemptionCents', 'VAT exemption', 'money'),
        c('discountCents', 'Discount', 'money'),
        c('totalCents', 'Final total', 'money'),
        c('cashCents', 'Cash tendered', 'money'),
        c('changeCents', 'Change', 'money')
      ],
      notes: [
        'Completed retail sales only. Cash tendered includes change; revenue is the saved final total. Discount/VAT amounts are saved sale snapshots.'
      ],
      sums: [
        { key: 'totalCents', label: 'Retail revenue', format: 'money' },
        { key: 'quantity', label: 'Units sold' },
        { key: 'discountCents', label: 'Discounts', format: 'money' },
        { key: 'vatExemptionCents', label: 'VAT exemption', format: 'money' }
      ],
      sort: sql`created_at DESC, id DESC`
    }
  if (filter.kind === 'income')
    return {
      base: sql`SELECT id, reference, created_at AS occurred_at, customer_name, 'Retail' AS channel, total_cents, reference || ' ' || customer_name AS search_text FROM sales WHERE created_at >= ${start} AND created_at < ${end}
      UNION ALL SELECT id, reference, delivered_at, customer_name, 'Wholesale', total_cents, reference || ' ' || customer_name FROM wholesale_orders WHERE status = 'delivered' AND delivered_at >= ${start} AND delivered_at < ${end}`,
      columns: [
        c('channel', 'Channel'),
        c('reference', 'Reference'),
        c('occurredAt', 'Completion / delivery', 'dateTime'),
        c('customerName', 'Client'),
        c('totalCents', 'Revenue', 'money')
      ],
      notes: [
        'Wholesale revenue is recognized on delivery, not order creation or collection. AR collections are reported separately and are not added to revenue again. Income here means revenue, not profit.'
      ],
      sums: [{ key: 'totalCents', label: 'Combined revenue', format: 'money' }],
      sort: sql`occurred_at DESC, channel, id DESC`
    }
  if (filter.kind === 'cash')
    return {
      base: sql`SELECT id, reference, created_at, cashier_name, total_cents, cash_cents, change_cents,
      cash_cents - change_cents AS net_cash_cents, cash_cents - change_cents - total_cents AS difference_cents,
      reference || ' ' || cashier_name AS search_text FROM sales WHERE created_at >= ${start} AND created_at < ${end} AND cash_cents - change_cents != total_cents`,
      columns: [
        c('reference', 'Sale'),
        c('createdAt', 'Date / time', 'dateTime'),
        c('cashierName', 'Cashier'),
        c('totalCents', 'Expected total', 'money'),
        c('cashCents', 'Tendered', 'money'),
        c('changeCents', 'Change', 'money'),
        c('netCashCents', 'Recorded net cash', 'money'),
        c('differenceCents', 'Difference', 'money')
      ],
      notes: [
        'Reconciles recorded cash tendered minus change against saved sale totals. No physical cash-count/drawer source exists. Valid exact/excess payments must not be flagged.'
      ],
      sort: sql`created_at DESC, id DESC`
    }
  if (filter.kind === 'overdue')
    return {
      base: sql`SELECT w.id, w.reference, w.customer_name, w.due_date, w.status, w.total_cents, ${paidAR} AS paid_cents,
      w.total_cents - ${paidAR} AS remaining_cents, w.reference || ' ' || w.customer_name AS search_text FROM wholesale_orders w
      WHERE w.status != 'cancelled' AND w.due_date < ${localDate()} AND w.total_cents > ${paidAR}`,
      columns: [
        c('customerName', 'Client'),
        c('reference', 'Order'),
        c('dueDate', 'Due date'),
        c('status', 'Order status'),
        c('totalCents', 'Original amount', 'money'),
        c('paidCents', 'Paid', 'money'),
        c('remainingCents', 'Remaining', 'money'),
        c('paymentStatus', 'Payment status'),
        c('deadlineStatus', 'Deadline')
      ],
      notes: [
        'Current balances across all dates, using the same wholesale due-date and payment rules. Period filters do not limit this current overdue list.'
      ],
      sums: [{ key: 'remainingCents', label: 'Overdue balance', format: 'money' }],
      sort: sql`due_date, id`
    }
  if (filter.kind === 'arPayments')
    return {
      base: sql`SELECT p.id, p.paid_at, p.reference, p.amount_cents, p.method, p.notes, p.updated_at,
      w.reference AS order_reference, w.customer_name, w.total_cents - ${paidAR} AS remaining_cents,
      w.customer_name || ' ' || w.reference || ' ' || p.reference AS search_text
      FROM wholesale_payments p JOIN wholesale_orders w ON w.id = p.order_id WHERE p.paid_at >= ${filter.from} AND p.paid_at <= ${filter.to} AND w.status != 'cancelled'`,
      columns: [
        c('paidAt', 'Payment date'),
        c('customerName', 'Client'),
        c('orderReference', 'Order'),
        c('reference', 'Payment reference'),
        c('method', 'Method'),
        c('amountCents', 'Payment', 'money'),
        c('remainingCents', 'Current order balance', 'money'),
        c('notes', 'Notes'),
        c('updatedAt', 'Last updated', 'dateTime')
      ],
      notes: [
        'Persisted wholesale payments, including prepayments. Balances are current, not historical balances after each payment. Corrections are reflected in the original payment-date period.'
      ],
      sums: [{ key: 'amountCents', label: 'AR collections', format: 'money' }],
      sort: sql`paid_at DESC, id DESC`
    }
  if (filter.kind === 'apPayments')
    return {
      base: sql`SELECT p.id, p.paid_at, p.reference_number, p.method, p.notes, ROUND(p.amount * 100) AS amount_cents,
      s.organization AS supplier, po.order_number, i.invoice_number,
      MAX(0, ${owedAP} - ${paidAP}) AS remaining_cents,
      s.organization || ' ' || po.order_number || ' ' || COALESCE(p.reference_number, '') || ' ' || COALESCE(i.invoice_number, '') AS search_text
      FROM supplier_payments p JOIN suppliers s ON s.id = p.supplier_id JOIN purchase_orders po ON po.id = p.purchase_order_id
      LEFT JOIN supplier_invoices i ON i.id = p.invoice_id WHERE p.paid_at >= ${filter.from} AND p.paid_at <= ${filter.to}`,
      columns: [
        c('paidAt', 'Payment date'),
        c('supplier', 'Supplier'),
        c('orderNumber', 'Purchase order'),
        c('invoiceNumber', 'Invoice (optional)'),
        c('referenceNumber', 'Payment reference'),
        c('method', 'Method'),
        c('amountCents', 'Payment', 'money'),
        c('remainingCents', 'Current delivered PO balance', 'money'),
        c('notes', 'Notes')
      ],
      notes: [
        'Recorded supplier payments only. Outstanding PO balances follow received quantities × unit cost minus payments; invoice totals are not counted a second time.'
      ],
      sums: [{ key: 'amountCents', label: 'Supplier payments', format: 'money' }],
      sort: sql`paid_at DESC, id DESC`
    }
  if (filter.kind === 'regulated')
    return {
      base: sql`SELECT s.id, s.reference, s.created_at AS occurred_at, s.customer_name, 'Retail' AS channel,
      i.drug_id AS product_id, i.product_name AS product, i.batch_number, i.quantity,
      d.is_prescribed, d.is_controlled, i.quantity * i.unit_price_cents AS gross_cents,
      s.reference || ' ' || s.customer_name || ' ' || i.product_name AS search_text
      FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN drugs d ON d.id = i.drug_id WHERE ${period} AND (d.is_prescribed = 1 OR d.is_controlled = 1)
      UNION ALL SELECT w.id, w.reference, w.delivered_at, w.customer_name, 'Wholesale', i.drug_id, i.product_name, i.batch_number, i.quantity,
      d.is_prescribed, d.is_controlled, i.quantity * i.unit_price_cents, w.reference || ' ' || w.customer_name || ' ' || i.product_name
      FROM wholesale_order_items i JOIN wholesale_orders w ON w.id = i.order_id JOIN drugs d ON d.id = i.drug_id WHERE w.status = 'delivered' AND w.delivered_at >= ${start} AND w.delivered_at < ${end} AND (d.is_prescribed = 1 OR d.is_controlled = 1)`,
      columns: [
        c('channel', 'Channel'),
        c('reference', 'Transaction / order'),
        c('occurredAt', 'Date / time', 'dateTime'),
        c('customerName', 'Client'),
        product,
        c('batchNumber', 'Batch'),
        c('quantity', 'Units'),
        c('isPrescribed', 'Prescription flag (current)'),
        c('isControlled', 'Controlled flag (current)'),
        c('grossCents', 'Before-discount line value', 'money')
      ],
      notes: [
        'Uses current persisted prescription/controlled flags. Historical classification snapshots and prescription documents are not stored; this is not a regulatory compliance certification. Line amounts are before sale-level discounts.'
      ],
      sums: [{ key: 'quantity', label: 'Units' }],
      sort: sql`occurred_at DESC, channel, id DESC, product_id, batch_number`
    }
  const volume = movements(start, end)
  return {
    base: sql`WITH volume AS (SELECT drug_id, SUM(quantity) AS quantity FROM (${volume}) GROUP BY drug_id),
      ranked AS (SELECT d.id, d.id AS product_id, d.brand_name || ' (' || d.generic_name || ') ' || d.formulation AS product,
      d.category, d.is_archived, d.is_prescribed, d.is_controlled, COALESCE(v.quantity, 0) AS quantity,
      COALESCE((SELECT SUM(current_stock) FROM batches WHERE drug_id = d.id), 0) AS stock,
      d.brand_name || ' ' || d.generic_name || ' ' || d.formulation || ' ' || d.category AS search_text
      FROM drugs d LEFT JOIN volume v ON v.drug_id = d.id)
      SELECT *, DENSE_RANK() OVER (ORDER BY quantity DESC) AS movement_rank,
      CASE WHEN quantity = 0 THEN 'No movement' WHEN quantity = (SELECT MAX(quantity) FROM ranked) THEN 'Fastest (highest volume)'
      WHEN quantity = (SELECT MIN(quantity) FROM ranked WHERE quantity > 0) THEN 'Slowest selling (lowest positive volume)' ELSE 'Other selling products' END AS movement FROM ranked`,
    columns: [
      product,
      c('category', 'Category'),
      c('isArchived', 'Archived'),
      c('stock', 'Current on hand'),
      c('quantity', 'Units sold / delivered'),
      c('movementRank', 'Volume rank'),
      c('movement', 'Movement'),
      c('isPrescribed', 'Prescription flag'),
      c('isControlled', 'Controlled flag')
    ],
    notes: [
      'Period volume = completed retail units + delivered wholesale units. Highest volume is fastest; lowest positive volume is slowest selling; zero is no movement. Ties share classification (highest takes precedence). No arbitrary thresholds.',
      'Product links open existing product/batch details. Archived products remain visible for historical accuracy.'
    ],
    sums: [{ key: 'quantity', label: 'Units sold / delivered' }],
    sort: sql`quantity DESC, product, id`
  }
}

async function inventory(
  database: Kysely<Database>,
  filter: ReportFilter
): Promise<BusinessReport> {
  const rows = await database
    .selectFrom('drugs')
    .leftJoin('batches', 'batches.drugId', 'drugs.id')
    .select([
      'drugs.id as productId',
      'drugs.brandName',
      'drugs.genericName',
      'drugs.formulation',
      'drugs.isArchived',
      'drugs.reorderLevel',
      'batches.id as batchId',
      'batches.currentStock',
      'batches.buyPrice',
      'batches.sellPrice',
      'batches.expiresAt',
      'batches.physicalTag'
    ])
    .orderBy('drugs.brandName')
    .orderBy('drugs.id')
    .orderBy('batches.id')
    .execute()
  const quantities = new Map<number, { stock: number; sellable: number }>()
  const now = new Date()
  for (const row of rows) {
    const current = quantities.get(row.productId) ?? { stock: 0, sellable: 0 }
    current.stock += row.currentStock ?? 0
    if (!row.isArchived && isBatchSellable(row.currentStock ?? 0, String(row.expiresAt), now))
      current.sellable += row.currentStock ?? 0
    quantities.set(row.productId, current)
  }
  const mapped: ReportRow[] = rows
    .map((row) => {
      const quantity = quantities.get(row.productId)!
      return {
        productId: row.productId,
        product: `${row.brandName} (${row.genericName}) ${row.formulation}`,
        isArchived: row.isArchived,
        stock: quantity.stock,
        sellable: quantity.sellable,
        reorderLevel: row.reorderLevel,
        stockStatus: row.isArchived
          ? 'Archived'
          : quantity.sellable === 0
            ? 'Out of stock'
            : quantity.sellable <= row.reorderLevel
              ? 'Low stock'
              : 'In stock',
        batch: row.physicalTag ?? (row.batchId ? `Batch ${row.batchId}` : 'No batches'),
        quantity: row.currentStock ?? 0,
        expiresAt: row.expiresAt ? String(row.expiresAt) : '',
        expiryStatus: row.batchId
          ? expiryLabels[getExpiryStatus(String(row.expiresAt), now)]
          : 'No batches',
        costCents: Math.round((row.buyPrice ?? 0) * 100),
        priceCents: Math.round((row.sellPrice ?? 0) * 100),
        valueCents: Math.round((row.currentStock ?? 0) * (row.buyPrice ?? 0) * 100)
      }
    })
    .filter((row) =>
      `${row.product} ${row.batch}`.toLowerCase().includes(filter.search.toLowerCase())
    )
  return {
    title: reportTitles.inventory,
    generatedAt: now.toISOString(),
    filter,
    notes: [
      'Current stock, not a historical stock snapshot. Date range does not limit inventory. Valuation uses batch quantity × recorded batch purchase cost, rounded per batch; includes expired/archived stock still on hand. Product quantities repeat across batch rows—do not sum that column.',
      'Expiry and sellable/low-stock rules reuse existing inventory eligibility and reorder thresholds.'
    ],
    columns: [
      product,
      c('isArchived', 'Archived'),
      c('stock', 'Product on hand'),
      c('sellable', 'Product sellable'),
      c('reorderLevel', 'Threshold'),
      c('stockStatus', 'Stock status'),
      c('batch', 'Batch'),
      c('quantity', 'Batch quantity'),
      c('expiresAt', 'Expiry'),
      c('expiryStatus', 'Expiry status'),
      c('costCents', 'Unit cost', 'money'),
      c('priceCents', 'Selling price', 'money'),
      c('valueCents', 'Batch value', 'money')
    ],
    rows: mapped,
    totalRows: mapped.length,
    pageSize: 100,
    metrics: [
      { label: 'On-hand units', value: mapped.reduce((sum, row) => sum + Number(row.quantity), 0) },
      {
        label: 'Inventory at cost',
        value: mapped.reduce((sum, row) => sum + Number(row.valueCents), 0),
        format: 'money'
      }
    ]
  }
}
async function financial(
  database: Kysely<Database>,
  filter: ReportFilter
): Promise<BusinessReport> {
  const { start, end } = dateBounds(filter.from, filter.to)
  const data = (
    await sql<ReportRow>`SELECT
    (SELECT COALESCE(SUM(total_cents), 0) FROM sales WHERE created_at >= ${start} AND created_at < ${end}) AS retail,
    (SELECT COUNT(*) FROM sales WHERE created_at >= ${start} AND created_at < ${end}) AS retail_count,
    (SELECT COALESCE(SUM(total_cents), 0) FROM wholesale_orders WHERE status = 'delivered' AND delivered_at >= ${start} AND delivered_at < ${end}) AS wholesale,
    (SELECT COUNT(*) FROM wholesale_orders WHERE status = 'delivered' AND delivered_at >= ${start} AND delivered_at < ${end}) AS wholesale_count,
    (SELECT COALESCE(SUM(amount_cents), 0) FROM wholesale_payments WHERE paid_at >= ${filter.from} AND paid_at <= ${filter.to}) AS collections,
    (SELECT COALESCE(ROUND(SUM(amount) * 100), 0) FROM supplier_payments WHERE paid_at >= ${filter.from} AND paid_at <= ${filter.to}) AS expenses,
    (SELECT COALESCE(SUM(w.total_cents - ${paidAR}), 0) FROM wholesale_orders w WHERE status != 'cancelled') AS ar,
    (SELECT COALESCE(SUM(MAX(0, ${owedAP} - ${paidAP})), 0) FROM purchase_orders po WHERE status IN ('received', 'partially_received', 'cancelled')) AS ap`.execute(
      database
    )
  ).rows[0]
  const retail = Number(data.retail),
    wholesale = Number(data.wholesale),
    expenses = Number(data.expenses),
    collections = Number(data.collections)
  const metrics: ReportMetric[] = [
    { label: 'Retail revenue', value: retail, format: 'money' },
    { label: 'Delivered wholesale revenue', value: wholesale, format: 'money' },
    { label: 'Combined revenue', value: retail + wholesale, format: 'money' },
    { label: 'Supplier payments (recorded outflows)', value: expenses, format: 'money' },
    {
      label: 'Revenue minus supplier payments (not profit)',
      value: retail + wholesale - expenses,
      format: 'money'
    },
    { label: 'AR collections (not additional revenue)', value: collections, format: 'money' },
    {
      label: 'Retail receipts + AR collections − supplier payments',
      value: retail + collections - expenses,
      format: 'money'
    },
    { label: 'Current AR outstanding', value: Number(data.ar), format: 'money' },
    { label: 'Current AP outstanding', value: Number(data.ap), format: 'money' },
    { label: 'Current inventory at cost', value: await stockValuation(database), format: 'money' },
    { label: 'Retail transactions', value: Number(data.retailCount) },
    { label: 'Delivered wholesale orders', value: Number(data.wholesaleCount) }
  ]
  return {
    title: reportTitles.financial,
    filter,
    generatedAt: new Date().toISOString(),
    pageSize: 100,
    totalRows: metrics.length,
    metrics,
    columns: [
      c('metric', 'Metric'),
      c('amountCents', 'Amount (PHP)', 'money'),
      c('count', 'Count')
    ],
    rows: metrics.map((metric) => ({
      metric: metric.label,
      amountCents: metric.format === 'money' ? metric.value : null,
      count: metric.format ? null : metric.value
    })),
    notes: [
      'Revenue covers completed retail sales and wholesale orders delivered in the selected period. Wholesale prepayments are collections, not delivered revenue.',
      'Expenses here are recorded supplier payment outflows only, not accrual expenses or cost of goods sold. No payroll/rent/general-expense source exists. Differences shown are not accounting profit.',
      'AR, AP and inventory are current balances across all dates, not historical period-end balances. AR includes active unfulfilled credit orders per the existing wholesale module. AP uses received PO quantities, not invoice totals. Search does not apply to this summary.'
    ]
  }
}
export async function generateReport(
  input: ReportFilter,
  allRows = false
): Promise<BusinessReport> {
  const filter = reportSchema.parse(input)
  return db.transaction().execute(async (transaction) => {
    if (filter.kind === 'financial') return financial(transaction, filter)
    if (filter.kind === 'inventory') {
      const report = await inventory(transaction, filter)
      if (!allRows) report.rows = report.rows.slice((filter.page - 1) * 100, filter.page * 100)
      return report
    }
    const def = definition(filter)
    const filtered = sql`SELECT * FROM (${def.base}) WHERE instr(lower(search_text), lower(${filter.search})) > 0`
    const sums = (def.sums ?? []).map(
      (sum) => sql`COALESCE(SUM(${sql.ref(sum.key)}), 0) AS ${sql.ref(sum.key)}`
    )
    const aggregate = (
      await sql<ReportRow>`SELECT COUNT(*) AS count ${sums.length ? sql`, ${sql.join(sums)}` : sql``} FROM (${filtered})`.execute(
        transaction
      )
    ).rows[0]
    const result =
      await sql<ReportRow>`SELECT * FROM (${filtered}) ORDER BY ${def.sort ?? sql`id DESC`} ${allRows ? sql`` : sql`LIMIT 100 OFFSET ${(filter.page - 1) * 100}`}`.execute(
        transaction
      )
    const metrics: ReportMetric[] = [
      { label: 'Matching records', value: Number(aggregate.count) },
      ...(def.sums ?? []).map((sum) => ({
        label: sum.label,
        value: Number(aggregate[sum.key]),
        format: sum.format
      }))
    ]
    if (filter.kind === 'income') {
      const totals = await sql<{
        channel: string
        total: number
      }>`SELECT channel, SUM(total_cents) AS total FROM (${filtered}) GROUP BY channel`.execute(
        transaction
      )
      for (const channel of ['Retail', 'Wholesale'])
        metrics.push({
          label: `${channel} revenue`,
          value: totals.rows.find((row) => row.channel === channel)?.total ?? 0,
          format: 'money'
        })
    }
    const rows = result.rows.map((row) => {
      const { searchText, ...data } = row
      void searchText
      if (filter.kind === 'overdue')
        Object.assign(
          data,
          receivable(Number(data.totalCents), Number(data.paidCents), String(data.dueDate))
        )
      return data
    })
    return {
      title: reportTitles[filter.kind],
      generatedAt: new Date().toISOString(),
      filter,
      notes: def.notes,
      columns: def.columns,
      rows,
      metrics,
      totalRows: Number(aggregate.count),
      pageSize: 100
    }
  })
}
export function reportCsv(report: BusinessReport): string {
  const rows: unknown[][] = [
    [report.title],
    ['Generated at', report.generatedAt],
    ['Period', report.filter.from, report.filter.to],
    ['Search', report.filter.search],
    ...report.notes.map((note) => [note]),
    [],
    ...report.metrics.map((metric) => [
      metric.label,
      metric.format === 'money' ? (metric.value / 100).toFixed(2) : metric.value
    ]),
    [],
    report.columns.map((column) => column.label),
    ...report.rows.map((row) =>
      report.columns.map((column) =>
        row[column.key] === null || row[column.key] === undefined
          ? ''
          : column.format === 'money'
            ? (Number(row[column.key]) / 100).toFixed(2)
            : row[column.key]
      )
    )
  ]
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
