export const channels = {
  sales: {
    quote: 'sales.quote',
    checkout: 'sales.checkout',
    history: 'sales.history',
    getOne: 'sales.getOne',
    exportReceipt: 'sales.exportReceipt'
  },
  inventory: {
    recordStockOut: 'inventory.recordStockOut',
    getStockOuts: 'inventory.getStockOuts',
    exportReport: 'inventory.exportReport'
  },
  setup: {
    getStatus: 'setup.getStatus',
    createMaster: 'setup.createMaster'
  },
  dashboard: {
    getAdmin: 'dashboard.getAdmin'
  },
  account: {
    createOne: 'account.createOne',
    getAll: 'account.getAll',
    getOneById: 'account.getOneById',
    getOneByUsername: 'account.getOneByUsername',
    updateOneById: 'account.updateOneById',
    setBlockedById: 'account.setBlockedById',
    removeOneById: 'account.removeOneById'
  },
  customer: {
    getAll: 'customer.getAll',
    createOne: 'customer.createOne',
    updateOneById: 'customer.updateOneById',
    removeOneById: 'customer.removeOneById'
  },
  product: {
    getAll: 'product.getAll',
    createOne: 'product.createOne',
    updateOneById: 'product.updateOneById',
    removeOneById: 'product.removeOneById'
  },
  supplier: {
    getAll: 'supplier.getAll',
    createOne: 'supplier.createOne',
    updateOneById: 'supplier.updateOneById',
    removeOneById: 'supplier.removeOneById'
  },
  purchaseOrder: {
    getAll: 'purchaseOrder.getAll',
    createOne: 'purchaseOrder.createOne',
    updateStatusById: 'purchaseOrder.updateStatusById',
    recordDeliveryById: 'purchaseOrder.recordDeliveryById',
    removeOneById: 'purchaseOrder.removeOneById'
  },
  procurement: {
    getRecords: 'procurement.getRecords',
    uploadInvoice: 'procurement.uploadInvoice',
    openInvoice: 'procurement.openInvoice',
    recordPayment: 'procurement.recordPayment'
  },
  auth: {
    getStatus: 'auth.getStatus',
    signIn: 'auth.signIn',
    signOut: 'auth.signOut'
  }
} as const

export const roles = {
  master: 'master',
  staff: 'staff',
  cashier: 'cashier'
} as const

export const resources = {
  sale: 'sale',
  inventoryAdjustment: 'inventoryAdjustment',
  account: 'account',
  customer: 'customer',
  product: 'product',
  supplier: 'supplier',
  purchaseOrder: 'purchaseOrder'
} as const
