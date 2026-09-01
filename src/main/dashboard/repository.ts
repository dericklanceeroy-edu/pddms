import { db } from '@main/db'
import type { AdminDashboardData, DashboardAlertSeverity } from '@shared/dashboard'
import { sql } from 'kysely'

const reorderLevel = 10
const millisecondsPerDay = 86_400_000

const getSeverity = (ratio: number): DashboardAlertSeverity => {
  if (ratio <= 0.35) return 'critical'
  if (ratio <= 0.7) return 'warning'
  return 'watch'
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const generatedAt = new Date()
  const expiryLimit = new Date(generatedAt.getTime() + 90 * millisecondsPerDay)
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
      'drugs.formulation'
    ])
    .execute()

  const stockByDrug = new Map<number, { name: string; stock: number }>()
  for (const batch of batches) {
    const current = stockByDrug.get(batch.drugId)
    stockByDrug.set(batch.drugId, {
      name: `${batch.genericName} ${batch.formulation}`,
      stock: (current?.stock ?? 0) + batch.currentStock
    })
  }

  const expiryAlerts = batches
    .filter((batch) => {
      const expiresAt = new Date(batch.expiresAt)
      return batch.currentStock > 0 && expiresAt >= generatedAt && expiresAt <= expiryLimit
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
    .filter(([, item]) => item.stock <= reorderLevel)
    .map(([drugId, item]) => ({
      id: `drug-${drugId}`,
      productName: item.name,
      stockRemaining: item.stock,
      reorderLevel,
      lastRestockedAt: null,
      severity: getSeverity(item.stock / reorderLevel)
    }))

  const valuation = await db
    .selectFrom('batches')
    .select(sql<number>`coalesce(sum(current_stock * sell_price), 0)`.as('value'))
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
        trend: { direction: 'flat', percentage: 0, label: `At or below ${reorderLevel} units` },
        sparkline: []
      },
      {
        id: 'expiring-batches',
        label: 'Expiring batches',
        value: expiryAlerts.length,
        format: 'integer',
        trend: { direction: 'flat', percentage: 0, label: 'Within 90 days' },
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
        value: 0,
        format: 'integer',
        detail: 'Procurement records are not available yet.',
        status: 'healthy'
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
