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
// Note: Owed = delivered boxes at their invoice cost, less supplier credit notes applied.
const owedAP = sql`(COALESCE((SELECT ROUND(SUM(i.quantity * i.unit_cost) * 100) FROM supplier_delivery_items i JOIN supplier_deliveries d ON d.id = i.delivery_id WHERE d.purchase_order_id = po.id), 0)
  - COALESCE((SELECT ROUND(SUM(amount) * 100) FROM supplier_credit_notes WHERE purchase_order_id = po.id), 0))`
const paidAP = sql`COALESCE((SELECT ROUND(SUM(amount) * 100) FROM supplier_payments WHERE purchase_order_id = po.id), 0)`
const completedSale = sql`status = 'completed'`
export async function stockValuation(database: Kysely<Database> = db): Promise<number> {
  const result = await sql<{
    value: number
  }>`SELECT COALESCE(SUM(ROUND(current_stock * buy_price * 100)), 0) AS value FROM batches`.execute(
    database
  )
  return Number(result.rows[0].value)
}
/** Stock movement timestamps use SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) format. */
const sqliteTime = (iso: string): string => iso.replace('T', ' ').slice(0, 19)
function movements(start: string, end: string): RawBuilder<unknown> {
  return sql`SELECT i.drug_id, SUM(i.quantity * i.pieces_per_unit) AS quantity FROM sale_items i JOIN sales s ON s.id = i.sale_id
    WHERE s.created_at >= ${start} AND s.created_at < ${end} AND s.status = 'completed' GROUP BY i.drug_id
    UNION ALL SELECT i.drug_id, SUM(i.quantity * i.pieces_per_unit) FROM wholesale_order_items i JOIN wholesale_orders w ON w.id = i.order_id
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
  const period = sql`s.created_at >= ${start} AND s.created_at < ${end} AND s.status = 'completed'`
  const retail = sql`SELECT s.id, s.reference, s.created_at, s.customer_name, s.cashier_name,
    s.subtotal_cents, s.vat_exemption_cents, s.discount_cents, s.discount_type, s.total_cents, s.cash_cents, s.change_cents,
    s.payment_method, s.payment_reference,
    COALESCE((SELECT SUM(quantity * pieces_per_unit) FROM sale_items WHERE sale_id = s.id), 0) AS quantity,
    (SELECT GROUP_CONCAT(product_name || ' [batch ' || batch_number || '] × ' || quantity || CASE WHEN unit = 'box' THEN ' box(es) of ' || pieces_per_unit ELSE ' pc(s)' END || ' @ PHP ' || printf('%.2f', unit_price_cents / 100.0), '; ') FROM sale_items WHERE sale_id = s.id) AS products,
    s.reference || ' ' || s.customer_name || ' ' || s.cashier_name || ' ' || s.payment_method || ' ' || COALESCE(s.payment_reference, '') AS search_text
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
        c('quantity', 'Pieces'),
        c('subtotalCents', 'Subtotal', 'money'),
        c('discountType', 'Discount type'),
        c('vatExemptionCents', 'VAT exemption', 'money'),
        c('discountCents', 'Discount', 'money'),
        c('totalCents', 'Final total', 'money'),
        c('paymentMethod', 'Payment method'),
        c('paymentReference', 'Payment reference'),
        c('cashCents', 'Amount received', 'money'),
        c('changeCents', 'Change', 'money')
      ],
      notes: [
        'Completed retail sales only; voided sales are left out (see Voided Sales). Amount received is cash tendered (including change) or the exact GCash/Maya transfer; revenue is the saved final total. Discount/VAT amounts are saved sale snapshots.'
      ],
      sums: [
        { key: 'totalCents', label: 'Retail revenue', format: 'money' },
        { key: 'quantity', label: 'Pieces sold' },
        { key: 'discountCents', label: 'Discounts', format: 'money' },
        { key: 'vatExemptionCents', label: 'VAT exemption', format: 'money' }
      ],
      sort: sql`created_at DESC, id DESC`
    }
  if (filter.kind === 'income')
    return {
      base: sql`SELECT id, reference, created_at AS occurred_at, customer_name, 'Retail' AS channel, total_cents, reference || ' ' || customer_name AS search_text FROM sales WHERE created_at >= ${start} AND created_at < ${end} AND ${completedSale}
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
      reference || ' ' || cashier_name AS search_text FROM sales WHERE created_at >= ${start} AND created_at < ${end} AND ${completedSale} AND cash_cents - change_cents != total_cents`,
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
        'Reconciles recorded cash tendered minus change against saved sale totals, per sale. The physical drawer count at closing is in End-of-Day Cash Counts. Valid exact/excess payments must not be flagged.'
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
      i.drug_id AS product_id, i.product_name AS product, i.batch_number, i.quantity * i.pieces_per_unit AS quantity,
      d.is_prescribed, d.is_controlled, i.quantity * i.unit_price_cents AS gross_cents,
      s.prescriber_name, s.prescriber_license, s.prescription_number,
      s.reference || ' ' || s.customer_name || ' ' || i.product_name AS search_text
      FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN drugs d ON d.id = i.drug_id WHERE ${period} AND (d.is_prescribed = 1 OR d.is_controlled = 1)
      UNION ALL SELECT w.id, w.reference, w.delivered_at, w.customer_name, 'Wholesale', i.drug_id, i.product_name, i.batch_number, i.quantity * i.pieces_per_unit,
      d.is_prescribed, d.is_controlled, i.quantity * i.unit_price_cents, NULL, NULL, NULL, w.reference || ' ' || w.customer_name || ' ' || i.product_name
      FROM wholesale_order_items i JOIN wholesale_orders w ON w.id = i.order_id JOIN drugs d ON d.id = i.drug_id WHERE w.status = 'delivered' AND w.delivered_at >= ${start} AND w.delivered_at < ${end} AND (d.is_prescribed = 1 OR d.is_controlled = 1)`,
      columns: [
        c('channel', 'Channel'),
        c('reference', 'Transaction / order'),
        c('occurredAt', 'Date / time', 'dateTime'),
        c('customerName', 'Client'),
        product,
        c('batchNumber', 'Batch'),
        c('quantity', 'Pieces'),
        c('isPrescribed', 'Prescription flag (current)'),
        c('isControlled', 'Controlled flag (current)'),
        c('grossCents', 'Before-discount line value', 'money'),
        c('prescriberName', 'Prescribing doctor'),
        c('prescriberLicense', 'PRC license'),
        c('prescriptionNumber', 'Prescription no.')
      ],
      notes: [
        'Uses current persisted prescription/controlled flags. Retail sales record the prescribing doctor, PRC license and prescription number from checkout (sales before this was added show none). This is not a regulatory compliance certification. Line amounts are before sale-level discounts.'
      ],
      sums: [{ key: 'quantity', label: 'Pieces' }],
      sort: sql`occurred_at DESC, channel, id DESC, product_id, batch_number`
    }
  if (filter.kind === 'voids')
    return {
      base: sql`SELECT s.id, s.reference, s.created_at, s.voided_at, s.customer_name, s.cashier_name, s.total_cents, s.payment_method,
      s.voided_by_name, s.void_approved_by_name, s.void_reason,
      CASE WHEN s.void_items_returned = 0 THEN 'Kept by customer (written off as lost)' ELSE 'Returned to stock' END AS medicines,
      (SELECT GROUP_CONCAT(product_name || ' [batch ' || batch_number || '] × ' || quantity || CASE WHEN unit = 'box' THEN ' box(es) of ' || pieces_per_unit ELSE ' pc(s)' END, '; ') FROM sale_items WHERE sale_id = s.id) AS products,
      s.reference || ' ' || s.customer_name || ' ' || s.cashier_name || ' ' || COALESCE(s.void_reason, '') AS search_text
      FROM sales s WHERE s.status = 'voided' AND s.voided_at >= ${start} AND s.voided_at < ${end}`,
      columns: [
        c('reference', 'Sale'),
        c('createdAt', 'Sold', 'dateTime'),
        c('voidedAt', 'Voided', 'dateTime'),
        c('customerName', 'Customer'),
        c('cashierName', 'Cashier'),
        c('products', 'Items'),
        c('medicines', 'Medicines'),
        c('totalCents', 'Sale total', 'money'),
        c('paymentMethod', 'Paid by'),
        c('voidedByName', 'Voided by'),
        c('voidApprovedByName', 'Approved by'),
        c('voidReason', 'Reason')
      ],
      notes: [
        'Whole retail sales of the same day voided because they were rung up wrong; the sale stays in history marked VOID and is left out of sales totals. Medicines that came back went to their original batch; medicines the customer kept were written off as lost (see Write-offs and Losses). A day whose sale is older, or whose cash drawer was already counted, cannot be voided.'
      ],
      sums: [{ key: 'totalCents', label: 'Voided amount', format: 'money' }],
      sort: sql`voided_at DESC, id DESC`
    }
  if (filter.kind === 'losses')
    return {
      base: sql`SELECT o.id, o.created_at, o.quantity, o.reason_code, o.reason AS notes, d.id AS product_id,
      d.brand_name || ' (' || d.generic_name || ') ' || d.formulation AS product, COALESCE(b.physical_tag, 'Batch ' || b.id) AS batch_number,
      b.expires_at, ROUND(b.buy_price * 100) AS unit_cost_cents, ROUND(o.quantity * b.buy_price * 100) AS cost_cents, a.full_name AS recorded_by,
      CASE o.reason_code WHEN 'expired' THEN 'Expired' WHEN 'damaged' THEN 'Damaged or broken' WHEN 'lost' THEN 'Lost or missing' WHEN 'recalled' THEN 'Recalled' ELSE 'Other' END AS reason_label,
      d.brand_name || ' ' || d.generic_name || ' ' || COALESCE(b.physical_tag, '') || ' ' || o.reason AS search_text
      FROM stock_outs o JOIN batches b ON b.id = o.batch_id JOIN drugs d ON d.id = b.drug_id JOIN accounts a ON a.id = o.recorded_by
      WHERE o.kind = 'write_off' AND o.created_at >= ${sqliteTime(start)} AND o.created_at < ${sqliteTime(end)}`,
      columns: [
        c('createdAt', 'Date / time', 'dateTime'),
        product,
        c('batchNumber', 'Batch'),
        c('expiresAt', 'Expiry'),
        c('reasonLabel', 'Reason'),
        c('notes', 'Notes'),
        c('quantity', 'Pieces'),
        c('unitCostCents', 'Cost per piece', 'money'),
        c('costCents', 'Loss at cost', 'money'),
        c('recordedBy', 'Recorded by')
      ],
      notes: [
        'Stock written off in the period, valued at the batch purchase cost. Totals by reason are shown above the table. Stock returned to suppliers is not a loss and is listed under Suppliers & Purchasing, Returns & Credit Notes.'
      ],
      sums: [
        { key: 'costCents', label: 'Total loss at cost', format: 'money' },
        { key: 'quantity', label: 'Pieces written off' }
      ],
      sort: sql`created_at DESC, id DESC`
    }
  if (filter.kind === 'cashCounts')
    return {
      // Note: A recount replaces the earlier count of that cashier and day (L2). Both stay listed,
      // labelled, and only the count in force goes into the net over / short.
      base: sql`SELECT *, CASE WHEN replaced_by IS NULL THEN difference_cents ELSE 0 END AS final_difference_cents,
      CASE WHEN replaced_by IS NOT NULL THEN 'Replaced by recount #' || replaced_by
        WHEN recount_of IS NOT NULL THEN 'Recount of #' || recount_of ELSE 'Final' END AS count_status
      FROM (SELECT id, business_date, created_at, cashier_name, opening_float_cents, cash_sales_count, cash_sales_cents, expected_cents, counted_cents, difference_cents,
      CASE WHEN difference_cents = 0 THEN 'Balanced' WHEN difference_cents > 0 THEN 'Over' ELSE 'Short' END AS result, notes, recount_of,
      (SELECT MIN(later.id) FROM cash_counts later WHERE later.recount_of = cash_counts.id) AS replaced_by,
      cashier_name || ' ' || COALESCE(notes, '') AS search_text
      FROM cash_counts WHERE business_date >= ${filter.from} AND business_date <= ${filter.to})`,
      columns: [
        c('businessDate', 'Business date'),
        c('createdAt', 'Counted at', 'dateTime'),
        c('cashierName', 'Cashier'),
        c('openingFloatCents', 'Opening float', 'money'),
        c('cashSalesCount', 'Cash sales'),
        c('cashSalesCents', 'Cash sales total', 'money'),
        c('expectedCents', 'Expected in drawer', 'money'),
        c('countedCents', 'Counted', 'money'),
        c('differenceCents', 'Over (+) / short (−)', 'money'),
        c('result', 'Result'),
        c('countStatus', 'Count'),
        c('notes', 'Notes')
      ],
      notes: [
        'Closing drawer counts entered by each cashier. Expected = opening float + completed cash sales of that cashier for the day (voided sales and GCash/Maya are not in the drawer). A cashier who counts again must give a reason; the recount replaces the earlier count, which stays listed. Net over / short counts only the counts in force.'
      ],
      sums: [{ key: 'finalDifferenceCents', label: 'Net over / short', format: 'money' }],
      sort: sql`business_date DESC, id DESC`
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
      c('quantity', 'Pieces sold / delivered'),
      c('movementRank', 'Volume rank'),
      c('movement', 'Movement'),
      c('isPrescribed', 'Prescription flag'),
      c('isControlled', 'Controlled flag')
    ],
    notes: [
      'Period volume = completed retail units + delivered wholesale units. Highest volume is fastest; lowest positive volume is slowest selling; zero is no movement. Ties share classification (highest takes precedence). No arbitrary thresholds.',
      'Product links open existing product/batch details. Archived products remain visible for historical accuracy.'
    ],
    sums: [{ key: 'quantity', label: 'Pieces sold / delivered' }],
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
      c('quantity', 'Batch quantity (pieces)'),
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
      {
        label: 'On-hand pieces',
        value: mapped.reduce((sum, row) => sum + Number(row.quantity), 0)
      },
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
    (SELECT COALESCE(SUM(total_cents), 0) FROM sales WHERE created_at >= ${start} AND created_at < ${end} AND ${completedSale}) AS retail,
    (SELECT COUNT(*) FROM sales WHERE created_at >= ${start} AND created_at < ${end} AND ${completedSale}) AS retail_count,
    (SELECT COALESCE(ROUND(SUM(o.quantity * b.buy_price) * 100), 0) FROM stock_outs o JOIN batches b ON b.id = o.batch_id WHERE o.kind = 'write_off' AND o.created_at >= ${sqliteTime(start)} AND o.created_at < ${sqliteTime(end)}) AS losses,
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
    { label: 'Stock written off at cost (losses)', value: Number(data.losses), format: 'money' },
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
      'AR, AP and inventory are current balances across all dates, not historical period-end balances. AR includes active unfulfilled credit orders per the existing wholesale module. AP uses delivered boxes at their invoice cost less supplier credit notes, not invoice totals. Search does not apply to this summary.',
      'Voided retail sales are left out of revenue. Losses are write-offs (expired, damaged, lost, recalled, other) at batch cost; stock returned to suppliers is not a loss.'
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
    if (filter.kind === 'losses') {
      const totals = await sql<{
        reasonLabel: string
        total: number
      }>`SELECT reason_label, SUM(cost_cents) AS total FROM (${filtered}) GROUP BY reason_label ORDER BY total DESC`.execute(
        transaction
      )
      for (const row of totals.rows)
        metrics.push({ label: `Loss: ${row.reasonLabel}`, value: Number(row.total), format: 'money' })
    }
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

const html = (value: unknown): string =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/**
 * Print-ready HTML for a report, rendered to PDF by the main process. Uses the same persisted
 * report data and formatting rules as the on-screen table and CSV export.
 */
export function reportHtml(report: BusinessReport): string {
  const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
  const cell = (row: ReportRow, column: ReportColumn): string => {
    const value = row[column.key]
    if (value === null || value === undefined || value === '') return '—'
    if (column.format === 'money') return peso.format(Number(value) / 100)
    if (column.format === 'dateTime') return new Date(String(value)).toLocaleString('en-PH')
    return String(value)
  }
  const period = ['inventory', 'overdue'].includes(report.filter.kind)
    ? 'Current snapshot'
    : `${report.filter.from} to ${report.filter.to}`
  return `<!doctype html><html><head><meta charset="utf-8"><title>${html(report.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #171221; font-size: 10px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { color: #555; margin: 0 0 8px; }
  .notes p { margin: 2px 0; color: #444; }
  .metrics { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
  .metric { border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; min-width: 120px; }
  .metric b { display: block; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1eef8; text-align: left; }
  th, td { border: 1px solid #ddd; padding: 4px 6px; vertical-align: top; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
</style></head><body>
<h1>Med Prix · ${html(report.title)}</h1>
<p class="meta">${html(period)} · Generated ${html(new Date(report.generatedAt).toLocaleString('en-PH'))}${report.filter.search ? ` · Search: ${html(report.filter.search)}` : ''} · ${report.totalRows} row(s)</p>
<div class="notes">${report.notes.map((note) => `<p>${html(note)}</p>`).join('')}</div>
<div class="metrics">${report.metrics
    .map(
      (metric) =>
        `<div class="metric">${html(metric.label)}<b>${html(metric.format === 'money' ? peso.format(metric.value / 100) : metric.value.toLocaleString('en-PH'))}</b></div>`
    )
    .join('')}</div>
<table><thead><tr>${report.columns.map((column) => `<th>${html(column.label)}</th>`).join('')}</tr></thead>
<tbody>${
    report.rows.length
      ? report.rows
          .map(
            (row) =>
              `<tr>${report.columns.map((column) => `<td>${html(cell(row, column))}</td>`).join('')}</tr>`
          )
          .join('')
      : `<tr><td colspan="${report.columns.length}">No matching records for this report.</td></tr>`
  }</tbody></table>
</body></html>`
}
