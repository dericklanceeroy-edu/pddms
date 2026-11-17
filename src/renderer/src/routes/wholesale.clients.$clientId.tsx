import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import CustomerProfileView from '@renderer/components/profiles/CustomerProfileView'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useEffect, type ReactElement } from 'react'

/** Pharmacy clients (wholesale buyers) are kept apart from retail customers. */
export const Route = createFileRoute('/wholesale/clients/$clientId')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  const { clientId } = Route.useParams()
  const isLoaded = useProfileStore((state) => state.areCustomersLoaded)
  const error = useProfileStore((state) => state.error)
  const loadCustomers = useProfileStore((state) => state.loadCustomers)
  const client = useProfileStore((state) =>
    state.customers.find((value) => value.id === Number(clientId))
  )
  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])
  if (error) return <DashboardShell pageTitle="Pharmacy Client">{error}</DashboardShell>
  if (!isLoaded)
    return <DashboardShell pageTitle="Pharmacy Client">Loading pharmacy client…</DashboardShell>
  if (clientId === 'new') return <CustomerProfileView customer={null} clientType="pharmacy" />
  if (client?.clientType === 'pharmacy')
    return <CustomerProfileView customer={client} clientType="pharmacy" key={client.id} />
  // Note: A retail customer opened here belongs to the Customers screen.
  return client ? (
    <Navigate to="/customers/$customerId" params={{ customerId: clientId }} />
  ) : (
    <Navigate to="/wholesale" />
  )
}
