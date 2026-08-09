export const channels = {
  authentication: {
    signIn: 'authentication/signIn'
  },
  user: {
    create: 'users/create',
    getById: 'users/getById',
    getByUsername: 'users/username',
    updateById: 'users/updateById',
    deleteById: 'users/deleteById'
  }
} as const
