import ItemProfileView from '@renderer/components/profiles/ItemProfileView'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/items/$itemId')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  const { itemId } = Route.useParams()
  const item = useProfileStore((state) => state.items.find((value) => value.id === Number(itemId)))
  if (itemId === 'new') return <ItemProfileView item={null} />
  return item ? <ItemProfileView item={item} key={item.id} /> : <Navigate to="/inventory" />
}
