export type DashboardMetricFormat = 'currency' | 'integer'
export type DashboardTrendDirection = 'up' | 'down' | 'flat'
export type DashboardAlertSeverity = 'critical' | 'warning' | 'watch'
export type DashboardOperationStatus = 'healthy' | 'attention' | 'critical'
export type DashboardDiscountType = 'None' | 'Senior Citizen' | 'PWD'
export type DashboardSummaryMetricId =
  | 'daily-sales'
  | 'items-sold'
  | 'low-stock-items'
  | 'expiring-batches'
  | 'my-transactions'
  | 'awaiting-delivery'
  | 'supplier-payments-due'
/** Which role-specific dashboard the data was built for. */
export type DashboardView = 'admin' | 'staff' | 'cashier'
export type DashboardOperationsPulseId =
  'purchase-orders' | 'supplier-payments' | 'stock-valuation' | 'inventory-alerts'

export interface DashboardSourceMetadata {
  kind: 'database'
  label: string
  generatedAt: string
}

export interface DashboardSummaryMetric {
  id: DashboardSummaryMetricId
  label: string
  value: number
  format: DashboardMetricFormat
  trend: { direction: DashboardTrendDirection; percentage: number; label: string }
  sparkline: number[]
}

export interface DashboardExpiryAlert {
  expiryStatus: import('./inventory').ExpiryStatus
  id: string
  productName: string
  batchNumber: string
  stockRemaining: number
  expiresAt: string
  severity: DashboardAlertSeverity
}

export interface DashboardLowStockAlert {
  id: string
  productName: string
  stockRemaining: number
  reorderLevel: number
  lastRestockedAt: string | null
  severity: DashboardAlertSeverity
}

export interface DashboardCategorySale {
  id: string
  label: string
  salesAmount: number
  sharePercentage: number
}

export interface DashboardRecentTransaction {
  id: string
  occurredAt: string
  itemCount: number
  amount: number
  paymentMethod: 'Cash'
  discountType: DashboardDiscountType
  cashierName: string
}

export interface DashboardOperationsPulseItem {
  id: DashboardOperationsPulseId
  label: string
  value: number
  format: DashboardMetricFormat
  detail: string
  status: DashboardOperationStatus
}

export interface AdminDashboardData {
  view: DashboardView
  source: DashboardSourceMetadata
  summaryMetrics: DashboardSummaryMetric[]
  expiryAlerts: DashboardExpiryAlert[]
  lowStockAlerts: DashboardLowStockAlert[]
  categorySales: DashboardCategorySale[]
  recentTransactions: DashboardRecentTransaction[]
  operationsPulse: DashboardOperationsPulseItem[]
}
