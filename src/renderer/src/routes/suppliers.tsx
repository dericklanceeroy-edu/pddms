import SupplierOrders from '@renderer/components/suppliers/SupplierOrders'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/suppliers')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  return <SupplierOrders />
}
