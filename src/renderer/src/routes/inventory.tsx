import ItemDirectory from '@renderer/components/profiles/ItemDirectory'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/inventory')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  return <ItemDirectory />
}
