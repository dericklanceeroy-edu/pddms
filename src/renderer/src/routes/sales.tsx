import SalesWorkspace from '@renderer/components/sales/SalesWorkspace'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/sales')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  return <SalesWorkspace />
}
