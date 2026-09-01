export const channels = {
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
  account: 'account',
  customer: 'customer',
  product: 'product',
  supplier: 'supplier',
  purchaseOrder: 'purchaseOrder'
} as const
