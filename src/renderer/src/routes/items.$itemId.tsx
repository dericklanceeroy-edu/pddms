import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import ItemProfileView from '@renderer/components/profiles/ItemProfileView'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useEffect, type ReactElement } from 'react'

export const Route = createFileRoute('/items/$itemId')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  const { itemId } = Route.useParams()
  const isLoaded = useProfileStore((state) => state.areItemsLoaded)
  const error = useProfileStore((state) => state.error)
  const loadItems = useProfileStore((state) => state.loadItems)
  const item = useProfileStore((state) => state.items.find((value) => value.id === Number(itemId)))
  useEffect(() => {
    void loadItems(true)
  }, [loadItems, itemId])
  if (error) return <DashboardShell pageTitle="Item profile">{error}</DashboardShell>
  if (!isLoaded) return <DashboardShell pageTitle="Item profile">Loading product…</DashboardShell>
  if (itemId === 'new') return <ItemProfileView item={null} />
  return item ? <ItemProfileView item={item} key={item.id} /> : <Navigate to="/inventory" />
}
