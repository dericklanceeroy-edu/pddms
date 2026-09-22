import { db } from '@main/db'
import { findInvoices } from '@main/procurement/repository'
import type { AdminDashboardData, DashboardAlertSeverity } from '@shared/dashboard'
import { EXPIRY_WARNING_DAYS, getExpiryStatus } from '@shared/inventory'
import { sql } from 'kysely'

const millisecondsPerDay = 86_400_000

const localDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getSeverity = (ratio: number): DashboardAlertSeverity => {
  if (!Number.isFinite(ratio)) return 'critical'
  if (ratio <= 0.35) return 'critical'
  if (ratio <= 0.7) return 'warning'
  return 'watch'
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const generatedAt = new Date()
  const paymentDeadlineLimit = localDate(new Date(generatedAt.getTime() + 7 * millisecondsPerDay))
  const products = await db
    .selectFrom('drugs')
    .select(['id', 'genericName', 'formulation', 'reorderLevel'])
    .where('isArchived', '=', 0)
    .execute()
  const batches = await db
    .selectFrom('batches')
    .innerJoin('drugs', 'drugs.id', 'batches.drugId')
    .select([
      'batches.id',
      'batches.physicalTag',
      'batches.currentStock',
      'batches.sellPrice',
      'batches.expiresAt',
      'drugs.id as drugId',
      'drugs.brandName',
      'drugs.genericName',
      'drugs.formulation',
      'drugs.reorderLevel'
    ])
    .where('drugs.isArchived', '=', 0)
    .execute()

  const stockByDrug = new Map<number, { name: string; stock: number; reorderLevel: number }>()
  for (const product of products) {
    stockByDrug.set(product.id, {
      name: `${product.genericName} ${product.formulation}`,
      stock: 0,
      reorderLevel: product.reorderLevel
    })
  }
  for (const batch of batches) {
    const current = stockByDrug.get(batch.drugId)
    const expiryStatus = getExpiryStatus(String(batch.expiresAt), generatedAt)
    stockByDrug.set(batch.drugId, {
      name: `${batch.genericName} ${batch.formulation}`,
      stock:
        (current?.stock ?? 0) +
        (batch.currentStock > 0 && expiryStatus !== 'expired' && expiryStatus !== 'unknown'
          ? batch.currentStock
          : 0),
      reorderLevel: batch.reorderLevel
    })
  }

  const expiryAlerts = batches
    .filter((batch) => {
      return (
        batch.currentStock > 0 && getExpiryStatus(String(batch.expiresAt), generatedAt) !== 'valid'
      )
    })
    .map((batch) => {
      const daysRemaining = Math.max(
        0,
        Math.ceil(
          (new Date(batch.expiresAt).getTime() - generatedAt.getTime()) / millisecondsPerDay
        )
      )
      return {
        id: `batch-${batch.id}`,
        productName: `${batch.brandName} (${batch.genericName})`,
        batchNumber: batch.physicalTag ?? `Batch ${batch.id}`,
        stockRemaining: batch.currentStock,
        expiresAt: String(batch.expiresAt),
        expiryStatus: getExpiryStatus(String(batch.expiresAt), generatedAt),
        severity: getSeverity(daysRemaining / EXPIRY_WARNING_DAYS)
      }
    })
    .sort((first, second) => first.expiresAt.localeCompare(second.expiresAt))

  const lowStockAlerts = [...stockByDrug.entries()]
    .filter(([, item]) => item.stock <= item.reorderLevel)
    .map(([drugId, item]) => ({
      id: `drug-${drugId}`,
      productName: item.name,
      stockRemaining: item.stock,
      reorderLevel: item.reorderLevel,
      lastRestockedAt: null,
      severity: getSeverity(item.stock / item.reorderLevel)
    }))

  const valuation = await db
    .selectFrom('batches')
    .innerJoin('drugs', 'drugs.id', 'batches.drugId')
    .select(sql<number>`coalesce(sum(current_stock * sell_price), 0)`.as('value'))
    .where('drugs.isArchived', '=', 0)
    .executeTakeFirstOrThrow()
  const openOrders = await db
    .selectFrom('purchaseOrders')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .where('status', 'not in', ['received', 'cancelled'])
    .executeTakeFirstOrThrow()
  const supplierPaymentsDue = (await findInvoices()).filter(
    (invoice) => invoice.dueDate <= paymentDeadlineLimit && invoice.status !== 'paid'
  ).length
  const start = new Date(generatedAt)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const dailySales = await db
    .selectFrom('sales')
    .select(({ fn }) => fn.sum<number>('totalCents').as('total'))
    .where('createdAt', '>=', start.toISOString())
    .where('createdAt', '<', end.toISOString())
    .executeTakeFirstOrThrow()
  const dailyItems = await db
    .selectFrom('saleItems')
    .innerJoin('sales', 'sales.id', 'saleItems.saleId')
    .select(({ fn }) => fn.sum<number>('saleItems.quantity').as('quantity'))
    .where('sales.createdAt', '>=', start.toISOString())
    .where('sales.createdAt', '<', end.toISOString())
    .executeTakeFirstOrThrow()
  const recentSales = await db
    .selectFrom('sales')
    .innerJoin('saleItems', 'saleItems.saleId', 'sales.id')
    .select([
      'sales.id',
      'sales.reference',
      'sales.createdAt',
      'sales.totalCents',
      'sales.discountType',
      'sales.cashierName'
    ])
    .select(({ fn }) => fn.sum<number>('saleItems.quantity').as('itemCount'))
    .groupBy('sales.id')
    .orderBy('sales.id', 'desc')
    .limit(10)
    .execute()

  return {
    source: { kind: 'database', label: 'Live database', generatedAt: generatedAt.toISOString() },
    summaryMetrics: [
      {
        id: 'daily-sales',
        label: 'Daily sales',
        value: Number(dailySales.total ?? 0) / 100,
        format: 'currency',
        trend: { direction: 'flat', percentage: 0, label: 'Completed sales today' },
        sparkline: []
      },
      {
        id: 'items-sold',
        label: 'Items sold',
        value: Number(dailyItems.quantity ?? 0),
        format: 'integer',
        trend: { direction: 'flat', percentage: 0, label: 'Units sold today' },
        sparkline: []
      },
      {
        id: 'low-stock-items',
        label: 'Low-stock items',
        value: lowStockAlerts.length,
        format: 'integer',
        trend: {
          direction: 'flat',
          percentage: 0,
          label: "At or below each product's reorder level"
        },
        sparkline: []
      },
      {
        id: 'expiring-batches',
        label: 'Expiring / expired',
        value: expiryAlerts.length,
        format: 'integer',
        trend: { direction: 'flat', percentage: 0, label: 'Expired or within 90 days' },
        sparkline: []
      }
    ],
    expiryAlerts,
    lowStockAlerts,
    categorySales: [],
    recentTransactions: recentSales.map((sale) => ({
      id: sale.reference,
      occurredAt: sale.createdAt,
      itemCount: Number(sale.itemCount),
      amount: sale.totalCents / 100,
      paymentMethod: 'Cash',
      discountType:
        sale.discountType === 'senior'
          ? 'Senior Citizen'
          : sale.discountType === 'pwd'
            ? 'PWD'
            : 'None',
      cashierName: sale.cashierName
    })),
    operationsPulse: [
      {
        id: 'purchase-orders',
        label: 'Open purchase orders',
        value: Number(openOrders.count),
        format: 'integer',
        detail: 'Draft, submitted, and partially received orders.',
        status: Number(openOrders.count) > 0 ? 'attention' : 'healthy'
      },
      {
        id: 'supplier-payments',
        label: 'Supplier payments due',
        value: supplierPaymentsDue,
        format: 'integer',
        detail: 'Unpaid or partially paid invoices overdue or due within seven days.',
        status: supplierPaymentsDue > 0 ? 'attention' : 'healthy'
      },
      {
        id: 'stock-valuation',
        label: 'Inventory valuation',
        value: Number(valuation.value),
        format: 'currency',
        detail: 'Current retail value from active database batches.',
        status: 'healthy'
      },
      {
        id: 'inventory-alerts',
        label: 'Inventory alerts',
        value: expiryAlerts.length + lowStockAlerts.length,
        format: 'integer',
        detail: 'Live low-stock and expiry signals.',
        status: expiryAlerts.length + lowStockAlerts.length > 0 ? 'attention' : 'healthy'
      }
    ]
  }
}
