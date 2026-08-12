import type { Id } from '@lib/db'
import { AccessControl } from 'accesscontrol'
import type { ValueOf } from 'type-fest'
import { resources as resourceKeys } from '.'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    owner: ({ value }) => {
      if (!(value instanceof Context)) {
        throw new Error("Context is not an instance of 'Context'")
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

export class Context {
  constructor(
    public owner: Id,
    public resources: Partial<Record<ValueOf<typeof resourceKeys>, Resource>>
  ) {}
}

export class Resource<T = unknown> {
  constructor(
    public owner: Id,
    public data: T
  ) {}
}

export * from './constants'
