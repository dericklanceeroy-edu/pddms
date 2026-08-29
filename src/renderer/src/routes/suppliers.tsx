import ModulePage from '@renderer/components/dashboard/ModulePage'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { FiTruck } from 'react-icons/fi'

export const Route = createFileRoute('/suppliers')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  return (
    <ModulePage
      title="Suppliers & orders"
      eyebrow="Procurement"
      description="Maintain supplier records, create purchase orders, receive deliveries, and track invoices."
      icon={FiTruck}
    />
  )
}
