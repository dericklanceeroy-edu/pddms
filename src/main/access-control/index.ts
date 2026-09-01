import { resources, roles } from '@shared/constants'
import { AccessControl } from 'accesscontrol'

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
  .createAny(resources.customer)
  .readAny(resources.customer)
  .updateAny(resources.customer)
  .deleteAny(resources.customer)
  .createAny(resources.product)
  .readAny(resources.product)
  .deleteAny(resources.product)

accessControl
  .grant(roles.manager)
  .readOwn(resources.account, ['*'])
  .updateOwn(resources.account, ['*'])
  .readAny(resources.customer)
  .createAny(resources.customer)
  .updateAny(resources.customer)
  .deleteAny(resources.customer)
  .readAny(resources.product)

export * from './errors'
export * from './helpers'
export * from './validators'
