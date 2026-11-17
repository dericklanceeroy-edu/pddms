import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import CustomerProfileView from '@renderer/components/profiles/CustomerProfileView'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useEffect, type ReactElement } from 'react'

export const Route = createFileRoute('/customers/$customerId')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  const { customerId } = Route.useParams()
  const isLoaded = useProfileStore((state) => state.areCustomersLoaded)
  const error = useProfileStore((state) => state.error)
  const loadCustomers = useProfileStore((state) => state.loadCustomers)
  const customer = useProfileStore((state) =>
    state.customers.find((value) => value.id === Number(customerId))
  )
  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])
  if (error) return <DashboardShell pageTitle="Customer Profile">{error}</DashboardShell>
  if (!isLoaded)
    return <DashboardShell pageTitle="Customer Profile">Loading customer…</DashboardShell>
  if (customerId === 'new') return <CustomerProfileView customer={null} clientType="retail" />
  // Note: Pharmacy clients are managed in Wholesale & Deliveries, apart from retail customers.
  if (customer?.clientType === 'pharmacy')
    return <Navigate to="/wholesale/clients/$clientId" params={{ clientId: customerId }} />
  return customer ? (
    <CustomerProfileView customer={customer} clientType="retail" key={customer.id} />
  ) : (
    <Navigate to="/customers" />
  )
}
