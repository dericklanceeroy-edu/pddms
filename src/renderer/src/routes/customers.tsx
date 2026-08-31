import CustomerDirectory from '@renderer/components/profiles/CustomerDirectory'
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/customers')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  const path = useRouterState({ select: (state) => state.location.pathname })
  return path === '/customers' ? <CustomerDirectory /> : <Outlet />
}
