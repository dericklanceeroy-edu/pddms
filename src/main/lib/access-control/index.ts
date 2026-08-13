import { AccessControl } from 'accesscontrol'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    ownerField: 'ownerId'
  }
})

export * from './constants'
export * from './errors'
