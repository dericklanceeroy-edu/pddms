import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import CustomerProfileView from '@renderer/components/profiles/CustomerProfileView'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useEffect, type ReactElement } from 'react'

export const Route = createFileRoute('/customers/$customerId')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  const { customerId } = Route.useParams()
  const isLoaded = useProfileStore((state) => state.isLoaded)
  const error = useProfileStore((state) => state.error)
  const load = useProfileStore((state) => state.load)
  const customer = useProfileStore((state) =>
    state.customers.find((value) => value.id === Number(customerId))
  )
  useEffect(() => {
    void load()
  }, [load])
  if (error) return <DashboardShell pageTitle="Customer profile">{error}</DashboardShell>
  if (!isLoaded)
    return <DashboardShell pageTitle="Customer profile">Loading customer…</DashboardShell>
  if (customerId === 'new') return <CustomerProfileView customer={null} />
  return customer ? (
    <CustomerProfileView customer={customer} key={customer.id} />
  ) : (
    <Navigate to="/customers" />
  )
}
