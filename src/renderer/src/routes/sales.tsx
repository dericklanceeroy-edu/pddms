import ModulePage from '@renderer/components/dashboard/ModulePage'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { FiShoppingBag } from 'react-icons/fi'

export const Route = createFileRoute('/sales')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  return (
    <ModulePage
      title="Sales & dispensing"
      eyebrow="Point of sale"
      description="Search medicines, manage the cart, apply eligible discounts, and complete customer transactions."
      icon={FiShoppingBag}
    />
  )
}
