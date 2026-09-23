import { accessControl, authorize } from '@main/access-control'
import { findOneById } from '@main/account/repository'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { reportSchema } from '@shared/reporting'
import { dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import z from 'zod'
import { generateReport, reportCsv } from './repository'

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
      ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' ')
      : 'Unable to generate/export this report. Check administrator access and try again.'
})
ipcMain.handle(channels.reporting.generate, async (_, input: unknown) => {
  try {
    await session()
    return { success: true, report: await generateReport(reportSchema.parse(input)) }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.reporting.export, async (_, input: unknown) => {
  try {
    const accountId = await session()
    const filter = reportSchema.parse(input)
    const selected = await dialog.showSaveDialog({
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
