import CustomerProfileView from '@renderer/components/profiles/CustomerProfileView'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/customers/$customerId')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  const { customerId } = Route.useParams()
  const customer = useProfileStore((state) =>
    state.customers.find((value) => value.id === Number(customerId))
  )
  if (customerId === 'new') return <CustomerProfileView customer={null} />
  return customer ? (
    <CustomerProfileView customer={customer} key={customer.id} />
  ) : (
    <Navigate to="/customers" />
  )
}
