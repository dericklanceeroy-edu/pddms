import type { Routes } from '@renderer/types'
import { Link } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

/**
 * TanStack Router's `<Link>` but the `to` attribute is typed with the
 * route paths.
 */
// Note: Is there a TanStack Router native way of doing this?
export default function TypedLink({
  children,
  to,
  ...props
}: Omit<ComponentProps<typeof Link>, 'to'> & { to: Routes }) {
  return (
    <Link {...props} to={to}>
      {children}
    </Link>
  )
}
