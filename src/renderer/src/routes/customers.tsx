import CustomerDirectory from '@renderer/components/profiles/CustomerDirectory'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/customers')({ component: CustomerDirectory })
