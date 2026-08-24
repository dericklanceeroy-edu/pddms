import type { FileRoutesByFullPath } from '@renderer/routeTree.gen'
import { Link } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

/**
 * TanStack Router's `<Link>` but the `to` field is typed with the
 * route paths.
 */
export default function TypedLink({
  children,
  to,
  ...props
}: Omit<ComponentProps<typeof Link>, 'to'> & { to: keyof FileRoutesByFullPath }) {
  return <Link {...props} to={to}>{children}</Link>
}
