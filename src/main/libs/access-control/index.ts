import { AccessControl } from 'accesscontrol'
import { resources, roles } from './constants'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    ownerField: 'accountId'
  }
})

accessControl
  .grant(roles.master)
  .createAny(resources.account)
  .readAny(resources.account, ['!password'])
  .updateOwn(resources.account, ['*'])
  .updateAny(resources.account, ['!password'])
  .deleteAny(resources.account)

accessControl
  .grant(roles.manager)
  .readOwn(resources.account, ['*'])
  .readAny(resources.account, ['!password'])
  .updateOwn(resources.account, ['*'])
  .updateAny(resources.account, ['!role', '!password'])

export * from './constants'
export * from './errors'
export * from './helpers'
export * from './validators'
