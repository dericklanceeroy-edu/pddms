import WholesaleWorkspace from '@renderer/components/wholesale/WholesaleWorkspace'
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/wholesale')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  const path = useRouterState({ select: (state) => state.location.pathname })
  return path === '/wholesale' ? <WholesaleWorkspace /> : <Outlet />
}
