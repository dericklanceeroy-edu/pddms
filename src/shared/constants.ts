export const channels = {
  administration: {
    logs: 'administration.logs',
    permissions: 'administration.permissions',
    backups: 'administration.backups',
    backup: 'administration.backup',
    restore: 'administration.restore'
  },
  reporting: {
    generate: 'reporting.generate',
    export: 'reporting.export',
    exportPdf: 'reporting.exportPdf'
  },
  wholesale: {
    create: 'wholesale.create',
    list: 'wholesale.list',
    get: 'wholesale.get',
    schedule: 'wholesale.schedule',
    deliver: 'wholesale.deliver',
    cancel: 'wholesale.cancel',
    pay: 'wholesale.pay',
    alerts: 'wholesale.alerts',
    exportReceipt: 'wholesale.exportReceipt'
  },
  sales: {
    void: 'sales.void',
    cashCountPreview: 'sales.cashCountPreview',
    recordCashCount: 'sales.recordCashCount',
    cashCounts: 'sales.cashCounts',
    quote: 'sales.quote',
    checkout: 'sales.checkout',
    history: 'sales.history',
    getOne: 'sales.getOne',
    exportReceipt: 'sales.exportReceipt'
  },
  inventory: {
    startCount: 'inventory.startCount',
    listCounts: 'inventory.listCounts',
    getCount: 'inventory.getCount',
    recordCountLines: 'inventory.recordCountLines',
    completeCount: 'inventory.completeCount',
    cancelCount: 'inventory.cancelCount',
    exportCountSheet: 'inventory.exportCountSheet',
    register: 'inventory.register',
    exportRegister: 'inventory.exportRegister',
    recordStockOut: 'inventory.recordStockOut',
    getStockOuts: 'inventory.getStockOuts',
    exportReport: 'inventory.exportReport'
  },
  setup: {
    getStatus: 'setup.getStatus',
    createMaster: 'setup.createMaster'
  },
  dashboard: {
    get: 'dashboard.get'
  },
  account: {
    updateProfile: 'account.updateProfile',
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
    removeOneById: 'customer.removeOneById',
    archiveOneById: 'customer.archiveOneById',
    restoreOneById: 'customer.restoreOneById',
    getArchived: 'customer.getArchived',
    mergeInto: 'customer.mergeInto'
  },
  product: {
    getAll: 'product.getAll',
    createOne: 'product.createOne',
    updateOneById: 'product.updateOneById',
    removeOneById: 'product.removeOneById',
    archiveOneById: 'product.archiveOneById',
    restoreOneById: 'product.restoreOneById',
    getArchived: 'product.getArchived',
    setWholesalePrice: 'product.setWholesalePrice'
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
    updateOneById: 'purchaseOrder.updateOneById',
    updateStatusById: 'purchaseOrder.updateStatusById',
    recordDeliveryById: 'purchaseOrder.recordDeliveryById',
    removeOneById: 'purchaseOrder.removeOneById'
  },
  priceList: {
    getAll: 'priceList.getAll',
    createPack: 'priceList.createPack',
    updatePrice: 'priceList.updatePrice',
    archivePack: 'priceList.archivePack',
    restorePack: 'priceList.restorePack',
    differences: 'priceList.differences'
  },
  supplierReturn: {
    getAll: 'supplierReturn.getAll',
    recordReturn: 'supplierReturn.recordReturn',
    recordCreditNote: 'supplierReturn.recordCreditNote',
    applyCreditNote: 'supplierReturn.applyCreditNote'
  },
  procurement: {
    getRecords: 'procurement.getRecords',
    chooseInvoiceFile: 'procurement.chooseInvoiceFile',
    uploadInvoice: 'procurement.uploadInvoice',
    openInvoice: 'procurement.openInvoice',
    downloadInvoice: 'procurement.downloadInvoice',
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
  administration: 'administration',
  report: 'report',
  wholesale: 'wholesale',
  receivable: 'receivable',
  sale: 'sale',
  inventoryAdjustment: 'inventoryAdjustment',
  account: 'account',
  customer: 'customer',
  product: 'product',
  supplier: 'supplier',
  purchaseOrder: 'purchaseOrder',
  /** Supplier price list (agreed cost per pack). */
  priceList: 'priceList',
  /** Stock sent back to suppliers and supplier credit notes. */
  supplierReturn: 'supplierReturn',
  /** Voiding a completed retail sale. */
  saleVoid: 'saleVoid',
  /** End-of-day cash drawer counts of all cashiers. */
  cashCount: 'cashCount'
} as const
