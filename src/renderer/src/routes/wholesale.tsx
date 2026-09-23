import WholesaleWorkspace from '@renderer/components/wholesale/WholesaleWorkspace'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/wholesale')({ component: WholesaleWorkspace })
