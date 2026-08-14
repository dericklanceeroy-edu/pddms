export const channels = {
  account: {
    createOne: 'account.createOne',
    getOneById: 'account.getOneById',
    getOneByUsername: 'account.getOneByUsername',
    updateOneById: 'account.updateOneById',
    deleteOneById: 'account.deleteOneById',
    assignRoleById: 'account.assignRoleById'
  },
  auth: {
    signIn: 'auth.signIn',
    signOut: 'auth.signOut'
  }
} as const
