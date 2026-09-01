import { db } from '@main/db'
import type { AdminDashboardData, DashboardAlertSeverity } from '@shared/dashboard'
import { sql } from 'kysely'

const millisecondsPerDay = 86_400_000

const getSeverity = (ratio: number): DashboardAlertSeverity => {
  if (ratio <= 0.35) return 'critical'
  if (ratio <= 0.7) return 'warning'
  return 'watch'
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const generatedAt = new Date()
  const expiryLimit = new Date(generatedAt.getTime() + 90 * millisecondsPerDay)
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
    stockByDrug.set(batch.drugId, {
      name: `${batch.genericName} ${batch.formulation}`,
      stock: (current?.stock ?? 0) + batch.currentStock,
      reorderLevel: batch.reorderLevel
    })
  }

  const expiryAlerts = batches
    .filter((batch) => {
      const expiresAt = new Date(batch.expiresAt)
      return batch.currentStock > 0 && expiresAt <= expiryLimit
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
        expiresAt: new Date(batch.expiresAt).toISOString(),
        severity: getSeverity(daysRemaining / 90)
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

  return {
    source: { kind: 'database', label: 'Live database', generatedAt: generatedAt.toISOString() },
    summaryMetrics: [
      {
        id: 'daily-sales',
        label: 'Daily sales',
        value: 0,
        format: 'currency',
        trend: { direction: 'flat', percentage: 0, label: 'No sales records yet' },
        sparkline: []
      },
      {
        id: 'items-sold',
        label: 'Items sold',
        value: 0,
        format: 'integer',
        trend: { direction: 'flat', percentage: 0, label: 'No sales records yet' },
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
    recentTransactions: [],
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
        value: 0,
        format: 'integer',
        detail: 'Supplier payment records are not available yet.',
        status: 'healthy'
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
