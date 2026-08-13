import { AccessControl } from 'accesscontrol'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    ownerField: 'ownerId'
  }
})

export * from './constants'
export * from './errors'

accessControl.grant('staff').readOwn('account')

const permission = accessControl
  .can('staff')
  .with({
    user: {
      id: 0
    },
    account: {
      ownerId: 0,
      data: null
    }
  })
  .readOwn('account')

console.log(permission.granted)
