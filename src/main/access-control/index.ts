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
  .readAny(resources.administration)
  .createAny(resources.administration)
  .updateAny(resources.administration)
  .readAny(resources.report)
  .createAny(resources.wholesale)
  .readAny(resources.wholesale)
  .updateAny(resources.wholesale)
  .createAny(resources.receivable)
  .readAny(resources.receivable)
  .createAny(resources.sale)
  .readAny(resources.sale)
  .createAny(resources.inventoryAdjustment)
  .readAny(resources.inventoryAdjustment)
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
  .updateAny(resources.product)
  .deleteAny(resources.product)
  .createAny(resources.supplier)
  .readAny(resources.supplier)
  .updateAny(resources.supplier)
  .deleteAny(resources.supplier)
  .createAny(resources.purchaseOrder)
  .readAny(resources.purchaseOrder)
  .updateAny(resources.purchaseOrder)
  .deleteAny(resources.purchaseOrder)

accessControl
  .grant(roles.staff)
  .createAny(resources.wholesale)
  .readAny(resources.wholesale)
  .updateAny(resources.wholesale)
  .createAny(resources.sale)
  .readOwn(resources.sale)
  .readOwn(resources.account, ['*'])
  .updateOwn(resources.account, ['*'])
  .readAny(resources.customer)
  .createAny(resources.customer)
  .updateAny(resources.customer)
  .deleteAny(resources.customer)
  .readAny(resources.product)
  .createAny(resources.product)
  .updateAny(resources.product)
  .createAny(resources.supplier)
  .readAny(resources.supplier)
  .updateAny(resources.supplier)
  .deleteAny(resources.supplier)
  .createAny(resources.purchaseOrder)
  .readAny(resources.purchaseOrder)
  .updateAny(resources.purchaseOrder)
  .deleteAny(resources.purchaseOrder)

accessControl
  .grant(roles.cashier)
  .createAny(resources.sale)
  .readOwn(resources.sale)
  .readOwn(resources.account, ['*'])
  .updateOwn(resources.account, ['*'])
  .readAny(resources.customer)
  .createAny(resources.customer)
  .updateAny(resources.customer)
  .readAny(resources.product)

export * from './errors'
export * from './helpers'
export * from './validators'
