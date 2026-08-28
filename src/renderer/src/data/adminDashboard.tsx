const DEMO_DELAY_MS = 350

export type DashboardDataSourceKind = 'demo'
export type DashboardMetricFormat = 'currency' | 'integer'
export type DashboardTrendDirection = 'up' | 'down' | 'flat'
export type DashboardAlertSeverity = 'critical' | 'warning' | 'watch'
export type DashboardOperationStatus = 'healthy' | 'attention' | 'critical'
export type DashboardDiscountType = 'None' | 'Senior Citizen' | 'PWD'

export type DashboardSummaryMetricId =
  'daily-sales' | 'items-sold' | 'low-stock-items' | 'expiring-batches'

export type DashboardOperationsPulseId =
  'purchase-orders' | 'supplier-payments' | 'stock-valuation' | 'inventory-alerts'

export interface DashboardSourceMetadata {
  kind: DashboardDataSourceKind
  label: string
  message: string
  generatedAt: string
}

export interface DashboardMetricTrend {
  direction: DashboardTrendDirection
  percentage: number
  label: string
}

export interface DashboardSummaryMetric {
  id: DashboardSummaryMetricId
  label: string
  value: number
  format: DashboardMetricFormat
  trend: DashboardMetricTrend
  sparkline: number[]
}

export type AdminDashboardSummaryMetrics = [
  DashboardSummaryMetric,
  DashboardSummaryMetric,
  DashboardSummaryMetric,
  DashboardSummaryMetric
]

export interface DashboardExpiryAlert {
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
  lastRestockedAt: string
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
  source: DashboardSourceMetadata
  summaryMetrics: AdminDashboardSummaryMetrics
  expiryAlerts: DashboardExpiryAlert[]
  lowStockAlerts: DashboardLowStockAlert[]
  categorySales: DashboardCategorySale[]
  recentTransactions: DashboardRecentTransaction[]
  operationsPulse: DashboardOperationsPulseItem[]
}

function shiftDate(reference: Date, days: number): string {
  const date = new Date(reference)

  date.setDate(date.getDate() + days)

  return date.toISOString()
}

function shiftMinutes(reference: Date, minutes: number): string {
  const date = new Date(reference)

  date.setMinutes(date.getMinutes() + minutes)

  return date.toISOString()
}

function createAbortError(): DOMException {
  return new DOMException('The dashboard data request was aborted.', 'AbortError')
}

function waitForDemoData(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const finish = (): void => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    const abort = (): void => {
      clearTimeout(timeoutId)
      reject(createAbortError())
    }

    const timeoutId = setTimeout(finish, DEMO_DELAY_MS)

    signal?.addEventListener('abort', abort, { once: true })
  })
}

function createAdminDashboardData(reference: Date): AdminDashboardData {
  const summaryMetrics: AdminDashboardSummaryMetrics = [
    {
      id: 'daily-sales',
      label: 'Daily sales',
      value: 13048,
      format: 'currency',
      trend: { direction: 'up', percentage: 8.4, label: 'vs. yesterday' },
      sparkline: [7200, 8100, 7650, 9400, 11200, 10300, 12150, 11600, 13048]
    },
    {
      id: 'items-sold',
      label: 'Items sold',
      value: 680,
      format: 'integer',
      trend: { direction: 'down', percentage: 3.2, label: 'vs. yesterday' },
      sparkline: [520, 560, 545, 610, 585, 730, 705, 650, 680]
    },
    {
      id: 'low-stock-items',
      label: 'Low-stock items',
      value: 4,
      format: 'integer',
      trend: { direction: 'down', percentage: 20, label: 'since last week' },
      sparkline: [9, 8, 8, 7, 6, 7, 5, 5, 4]
    },
    {
      id: 'expiring-batches',
      label: 'Expiring batches',
      value: 4,
      format: 'integer',
      trend: { direction: 'flat', percentage: 0, label: 'within 90 days' },
      sparkline: [3, 3, 4, 4, 4, 5, 5, 4, 4]
    }
  ]

  return {
    source: {
      kind: 'demo',
      label: 'Demo data',
      message: 'A temporary sample snapshot is shown because no dashboard API is connected.',
      generatedAt: reference.toISOString()
    },
    summaryMetrics,
    expiryAlerts: [
      {
        id: 'expiry-batch-1042',
        productName: 'Amoxicillin 500 mg capsule',
        batchNumber: 'AMX-1042',
        stockRemaining: 42,
        expiresAt: shiftDate(reference, 12),
        severity: 'critical'
      },
      {
        id: 'expiry-batch-1187',
        productName: 'Salbutamol 2 mg/5 mL syrup',
        batchNumber: 'SAL-1187',
        stockRemaining: 18,
        expiresAt: shiftDate(reference, 24),
        severity: 'critical'
      },
      {
        id: 'expiry-batch-1214',
        productName: 'Metformin 500 mg tablet',
        batchNumber: 'MET-1214',
        stockRemaining: 96,
        expiresAt: shiftDate(reference, 47),
        severity: 'warning'
      },
      {
        id: 'expiry-batch-1289',
        productName: 'Loratadine 10 mg tablet',
        batchNumber: 'LOR-1289',
        stockRemaining: 64,
        expiresAt: shiftDate(reference, 76),
        severity: 'watch'
      }
    ],
    lowStockAlerts: [
      {
        id: 'low-stock-ibuprofen',
        productName: 'Ibuprofen 200 mg tablet',
        stockRemaining: 4,
        reorderLevel: 24,
        lastRestockedAt: shiftDate(reference, -21),
        severity: 'critical'
      },
      {
        id: 'low-stock-paracetamol',
        productName: 'Paracetamol 500 mg tablet',
        stockRemaining: 7,
        reorderLevel: 30,
        lastRestockedAt: shiftDate(reference, -16),
        severity: 'critical'
      },
      {
        id: 'low-stock-diphenhydramine',
        productName: 'Diphenhydramine 25 mg capsule',
        stockRemaining: 13,
        reorderLevel: 25,
        lastRestockedAt: shiftDate(reference, -12),
        severity: 'warning'
      },
      {
        id: 'low-stock-azithromycin',
        productName: 'Azithromycin 250 mg tablet',
        stockRemaining: 22,
        reorderLevel: 30,
        lastRestockedAt: shiftDate(reference, -9),
        severity: 'watch'
      }
    ],
    categorySales: [
      {
        id: 'over-the-counter',
        label: 'Over-the-counter',
        salesAmount: 4424,
        sharePercentage: 33.9
      },
      { id: 'prescription', label: 'Prescription', salesAmount: 4323, sharePercentage: 33.1 },
      {
        id: 'vitamins-supplements',
        label: 'Vitamins & supplements',
        salesAmount: 2530,
        sharePercentage: 19.4
      },
      { id: 'personal-care', label: 'Personal care', salesAmount: 1771, sharePercentage: 13.6 }
    ],
    recentTransactions: [
      {
        id: 'MP-5847',
        occurredAt: shiftMinutes(reference, -18),
        itemCount: 5,
        amount: 1293,
        paymentMethod: 'Cash',
        discountType: 'None',
        cashierName: 'Maria Santos'
      },
      {
        id: 'MP-5846',
        occurredAt: shiftMinutes(reference, -47),
        itemCount: 3,
        amount: 684.5,
        paymentMethod: 'Cash',
        discountType: 'Senior Citizen',
        cashierName: 'Joel Rivera'
      },
      {
        id: 'MP-5845',
        occurredAt: shiftMinutes(reference, -86),
        itemCount: 7,
        amount: 2150,
        paymentMethod: 'Cash',
        discountType: 'PWD',
        cashierName: 'Maria Santos'
      },
      {
        id: 'MP-5844',
        occurredAt: shiftMinutes(reference, -134),
        itemCount: 2,
        amount: 425,
        paymentMethod: 'Cash',
        discountType: 'None',
        cashierName: 'Joel Rivera'
      },
      {
        id: 'MP-5843',
        occurredAt: shiftMinutes(reference, -245),
        itemCount: 4,
        amount: 972,
        paymentMethod: 'Cash',
        discountType: 'None',
        cashierName: 'Maria Santos'
      }
    ],
    operationsPulse: [
      {
        id: 'purchase-orders',
        label: 'Open purchase orders',
        value: 6,
        format: 'integer',
        detail: '2 deliveries are expected within three days.',
        status: 'attention'
      },
      {
        id: 'supplier-payments',
        label: 'Supplier payments due',
        value: 3,
        format: 'integer',
        detail: '1 payment reaches its deadline tomorrow.',
        status: 'critical'
      },
      {
        id: 'stock-valuation',
        label: 'Inventory valuation',
        value: 246780,
        format: 'currency',
        detail: 'Estimated retail value across the sample stock.',
        status: 'healthy'
      },
      {
        id: 'inventory-alerts',
        label: 'Inventory alerts',
        value: 8,
        format: 'integer',
        detail: '4 low-stock and 4 expiry items need review.',
        status: 'attention'
      }
    ]
  }
}

export async function fetchAdminDashboardData(signal?: AbortSignal): Promise<AdminDashboardData> {
  await waitForDemoData(signal)

  return createAdminDashboardData(new Date())
}
