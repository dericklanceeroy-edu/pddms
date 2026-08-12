import type { Id } from '@lib/db'
import { AccessControl } from 'accesscontrol'
import { resources, type Resource } from '.'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    owner: ({ value }) => {
      if (!(value instanceof AccessControlContext)) {
        throw new Error(
          `Provided context value is not an instance of '${AccessControlContext.name}'`
        )
      }

      if (value.owner === undefined) {
        return false
      }

      for (const resource of Object.values(resources)) {
        const resourceItem = value.resources[resource]

        if (resourceItem !== undefined && resourceItem.owner !== value.owner) {
          return false
        }
      }

      return true
    }
  }
})

/**
 * A context passed to the access control.
 * 
 * Example:
 * 
 * ```ts
 * accessControl
 *  .can(role)
 *  .with({
 *    value: new AccessControlContext(id, {
 *      // ...
 *    })
 *  })
 *  .readOwn(resource)
 * ```
 */
export class AccessControlContext {
  constructor(
    public owner: Id | undefined,
    public resources: Partial<
      Record<
        Resource,
        {
          owner: Id
          data: unknown
        }
      >
    >
  ) {}
}

export * from './constants'
