import SupplierOrders from '@renderer/components/suppliers/SupplierOrders'
import { procurementTabs, type ProcurementTab } from '@renderer/data/supplierOrders'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/suppliers')({
  validateSearch: (search: Record<string, unknown>): { tab?: ProcurementTab } => ({
    tab: procurementTabs.some((item) => item.id === search.tab)
      ? (search.tab as ProcurementTab)
      : undefined
  }),
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SupplierOrders
      tab={tab ?? 'suppliers'}
      onTabChange={(next) => void navigate({ search: { tab: next }, replace: true })}
    />
  )
}
