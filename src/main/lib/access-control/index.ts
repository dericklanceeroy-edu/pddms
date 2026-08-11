import { Id, isId } from '@lib/db'
import { AccessControl } from 'accesscontrol'

export const accessControl = new AccessControl(undefined, {
  policy: {
    strict: true,
    owner: (ctx) => {
      if (ctx.owner === undefined) {
        throw new Error("Context does not have an 'owner' field")
      }

      if (!isId(ctx.owner)) {
        throw new Error("Context 'owner' field must be of type 'Id'")
      }

      // All of the resource-related field owners must match the owner, otherwise 
      // return false.
      for (const resourceKey of Object.values(resources)) {
        const resource = ctx[resourceKey]

        if (resource !== undefined && Object.hasOwn(resource, resourceKey)) {
          if (!Resource.isResource(resource)) {
            throw new Error(`Context field '${resourceKey}' is not a 'Resource'`)
          }

          if (resource.owner !== ctx.owner) {
            return false
          }
        }
      }

      return true
    }
  }
})

export class Resource<T = unknown> {
  constructor(
    public owner: Id,
    public data: T
  ) {}

  public static isResource(value: unknown): value is Resource {
    // prettier-ignore
    return (
      typeof value === 'object'
      && value !== null
      && Object.hasOwn(value, 'owner')
      && Object.hasOwn(value, 'data')
    )
  }
}

export const roles = {
  admin: 'admin',
  staff: 'staff'
} as const

export const resources = {
  user: 'user'
} as const

// To-do: Delete this manual testing.

accessControl
  .grant(roles.admin)
  .createAny(resources.user)
  .readAny(resources.user)
  .updateAny(resources.user)
  .deleteAny(resources.user)

// prettier-ignore
accessControl
  .grant(roles.staff)
  .readOwn(resources.user)

const permission = accessControl
  .can(roles.staff)
  .with({
    owner: 0,
    [resources.user]: new Resource(0, null)
  })
  .readOwn(resources.user)

// This should be true.
console.log(permission.granted)
