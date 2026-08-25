import type { FileRoutesByFullPath } from '@renderer/routeTree.gen'
import type { ComponentProps } from 'react'

/**
 * Native `<form>` but the `action` attribute is typed with the route
 * paths.
 */
export default function TypedForm({
  children,
  action,
  ...props
}: Omit<ComponentProps<'form'>, 'action'> & { action?: keyof FileRoutesByFullPath }) {
  return (
    <form {...props} action={action}>
      {children}
    </form>
  )
}
