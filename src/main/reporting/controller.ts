import { accessControl, authorize } from '@main/access-control'
import { findOneById } from '@main/account/repository'
import { state } from '@main/api'
import { windowDialog } from '@main/api/dialogs'
import { ipcMain } from '@main/api/ipc'
import { channels, resources } from '@shared/constants'
import { reportSchema } from '@shared/reporting'
import { formatValidationError } from '@shared/validation'
import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import z from 'zod'
import { generateReport, reportCsv, reportHtml } from './repository'

async function session(): Promise<number> {
  const id = state.session?.account.id
  if (!id) throw new Error('Administrator sign-in is required.')
  const account = await findOneById(id)
  if (state.session?.account.id !== id) throw new Error('The signed-in account changed.')
  if (!account || account.isArchived || !account.isVerified) {
    state.session = undefined
    throw new Error('Your session is no longer active.')
  }
  state.session = { account }
  authorize((current) => accessControl.can(current.account.role).readAny(resources.report))
  return id
}
const failure = (error: unknown): { success: false; error: string } => ({
  success: false,
  error:
    error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error && /^(The signed-in|Your session|Administrator)/.test(error.message)
        ? error.message
        : error instanceof Error && error.name === 'UnauthorizedError'
          ? 'You do not have permission to view reports.'
          : 'Unable to generate or export this report. Check that the file is not open in another program and try again.'
})
ipcMain.handle(channels.reporting.generate, async (_, input: unknown) => {
  try {
    await session()
    return { success: true, report: await generateReport(reportSchema.parse(input)) }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.reporting.export, async (event, input: unknown) => {
  try {
    const accountId = await session()
    const filter = reportSchema.parse(input)
    const selected = await windowDialog(event).showSaveDialog({
      title: 'Export business report',
      defaultPath: `${filter.kind}-${filter.from}-${filter.to}.csv`,
      filters: [{ name: 'CSV report', extensions: ['csv'] }]
    })
    if (selected.canceled || !selected.filePath) return { success: true, cancelled: true }
    if ((await session()) !== accountId) throw new Error('The signed-in account changed.')
    const report = await generateReport(filter, true)
    await writeFile(selected.filePath, reportCsv(report), 'utf8')
    return { success: true }
  } catch (error) {
    return failure(error)
  }
})

ipcMain.handle(channels.reporting.exportPdf, async (event, input: unknown) => {
  let renderer: BrowserWindow | null = null
  try {
    const accountId = await session()
    const filter = reportSchema.parse(input)
    const selected = await windowDialog(event).showSaveDialog({
      title: 'Save business report as PDF',
      defaultPath: `${filter.kind}-${filter.from}-${filter.to}.pdf`,
      filters: [{ name: 'PDF report', extensions: ['pdf'] }]
    })
    if (selected.canceled || !selected.filePath) return { success: true, cancelled: true }
    if ((await session()) !== accountId) throw new Error('The signed-in account changed.')
    const report = await generateReport(filter, true)
    // Note: Offscreen window with scripts disabled renders only the escaped report markup.
    renderer = new BrowserWindow({
      show: false,
      webPreferences: { javascript: false, sandbox: true, contextIsolation: true }
    })
    await renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reportHtml(report))}`)
    const pdf = await renderer.webContents.printToPDF({
      landscape: true,
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:center;color:#666">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
    })
    await writeFile(selected.filePath, pdf)
    return { success: true }
  } catch (error) {
    return failure(error)
  } finally {
    renderer?.destroy()
  }
})
