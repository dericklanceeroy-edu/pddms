import AdminDashboard from '@renderer/components/dashboard/AdminDashboard'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  return <AdminDashboard />
}
