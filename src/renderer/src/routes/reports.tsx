import ReportingWorkspace from '@renderer/components/reporting/ReportingWorkspace'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/reports')({ component: ReportingWorkspace })
