import type { Id } from '@lib/db'
import { AccessControl } from 'accesscontrol'
import { resources, type Resource } from '.'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    owner: ({ value }) => {
      if (!(value instanceof AccessControlContext)) {
        throw new Error(`Provided context value is not an instance of '${AccessControlContext.name}'`)
      }

      for (const resource of Object.values(resources)) {
        const accessControlResourceField = value.resources[resource]

        if (accessControlResourceField !== undefined && accessControlResourceField.owner !== value.owner) {
          return false
        }
      }

      return true
    }
  }
})

export class AccessControlContext {
  constructor(
    public owner: Id,
    public resources: Partial<Record<Resource, AccessControlResourceField>>
  ) {}
}

export class AccessControlResourceField<T = unknown> {
  constructor(
    public owner: Id,
    public data: T
  ) {}
}

export * from './constants'
