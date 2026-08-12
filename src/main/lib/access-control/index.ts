import type { Id } from '@lib/db'
import { AccessControl } from 'accesscontrol'
import { resources as resourceKeys, type Resource } from '.'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    owner: ({ value }) => {
      if (!(value instanceof AccessControlContext)) {
        throw new Error(`Provided context value is not an instance of '${AccessControlContext.name}'`)
      }

      for (const resourceKey of Object.values(resourceKeys)) {
        const resource = value.resources[resourceKey]

        if (resource !== undefined && resource.owner !== value.owner) {
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
