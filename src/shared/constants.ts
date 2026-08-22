export const channels = {
  account: {
    createOne: 'account.createOne',
    getOneById: 'account.getOneById',
    getOneByUsername: 'account.getOneByUsername',
    updateOneById: 'account.updateOneById',
    deleteOneById: 'account.deleteOneById'
  },
  auth: {
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
