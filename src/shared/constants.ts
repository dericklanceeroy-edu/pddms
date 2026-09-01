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
    setBlockedById: 'account.setBlockedById'
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
  auth: {
    getStatus: 'auth.getStatus',
    signIn: 'auth.signIn',
    signOut: 'auth.signOut'
  }
} as const

export const roles = {
  master: 'master',
  manager: 'manager'
} as const

export const resources = {
  account: 'account',
  customer: 'customer',
  product: 'product'
} as const
