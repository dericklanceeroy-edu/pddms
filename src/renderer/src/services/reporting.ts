import { channels } from '@shared/constants'
import type { BusinessReport, ReportFilter } from '@shared/reporting'

export async function getReport(filter: ReportFilter): Promise<BusinessReport> {
  const response = (await window.electron.ipcRenderer.invoke(
    channels.reporting.generate,
    filter
  )) as { success: boolean; error?: string; report: BusinessReport }
  if (!response.success) throw new Error(response.error ?? 'Unable to generate report.')
  return response.report
}
export async function exportReport(filter: ReportFilter): Promise<boolean> {
  const response = (await window.electron.ipcRenderer.invoke(
    channels.reporting.export,
    filter
  )) as { success: boolean; error?: string; cancelled?: boolean }
  if (!response.success) throw new Error(response.error ?? 'Unable to export report.')
  return !response.cancelled
}
