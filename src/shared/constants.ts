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
