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
    getOneById: 'account.getOneById',
    getOneByUsername: 'account.getOneByUsername',
    updateOneById: 'account.updateOneById',
    archiveOneById: 'account.archiveOneById'
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
  account: 'account'
} as const
