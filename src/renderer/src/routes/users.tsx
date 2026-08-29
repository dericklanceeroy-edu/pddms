import UserManagement from '@renderer/components/user-management/UserManagement'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/users')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  return <UserManagement />
}
