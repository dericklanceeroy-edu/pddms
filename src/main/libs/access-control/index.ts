import { AccessControl } from 'accesscontrol'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    ownerField: 'accountId'
  }
})

export * from './constants'
export * from './validators'
