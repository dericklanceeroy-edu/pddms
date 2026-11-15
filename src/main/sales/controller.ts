import { accessControl, authorize } from '@main/access-control'
import { findOneById } from '@main/account/repository'
import { state } from '@main/api'
import { windowDialog } from '@main/api/dialogs'
import { ipcMain } from '@main/api/ipc'
import { receiptPdf } from '@main/api/receipt-pdf'
import { channels, resources } from '@shared/constants'
import { receiptHtml, receiptNumber, receiptPlainText } from '@shared/receipt'
import { checkoutSchema, saleDraftSchema, SalesError } from '@shared/sales'
import { describeIssue } from '@shared/validation'
import { writeFile } from 'node:fs/promises'
import z from 'zod'
import { cashCountSchema, voidSaleSchema } from '@shared/controls'
import { isoDateSchema } from '@shared/schemas'
import {
  cashCountPreview,
  checkout,
  findCashCounts,
  getSale,
  history,
  quote,
  recordCashCount,
  voidSale
} from './repository'

async function session(read = false): Promise<{ id: number; all: boolean }> {
  const id = state.session?.account.id
  if (!id) throw new SalesError('Sign in to use sales.')
  const account = await findOneById(id)
  if (state.session?.account.id !== id)
    throw new SalesError('The signed-in account changed. Try again.')
  if (!account || account.isArchived || !account.isVerified) {
    state.session = undefined
    throw new SalesError('Your session is no longer active. Sign in again.')
  }
  state.session = { account }
  authorize((current) =>
    read
      ? accessControl
          .can(current.account.role, { user: { id }, sale: { accountId: id } })
          .readOwn(resources.sale)
      : accessControl.can(current.account.role).createAny(resources.sale)
  )
  return { id, all: accessControl.can(account.role).readAny(resources.sale).granted }
}
const failure = (error: unknown): { success: false; error: string } => ({
  success: false,
  error:
    error instanceof SalesError
      ? error.message
      : error instanceof Error && error.name === 'UnauthorizedError'
        ? 'You do not have permission to do this.'
        : error instanceof z.ZodError
        ? [...new Set(error.issues.map(describeIssue))].join(' ')
        : 'Unable to complete the sales operation. Refresh or retry; check transaction history before starting another payment.'
})
ipcMain.handle(channels.sales.quote, async (_, payload: unknown) => {
  try {
    await session()
    return { success: true, totals: await quote(saleDraftSchema.parse(payload)) }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.checkout, async (_, payload: unknown) => {
  try {
    const account = await session()
    const sale = await checkout(checkoutSchema.parse(payload), account.id)
    state.database.stale = true
    return { success: true, sale }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.history, async (_, beforeId: unknown) => {
  try {
    const account = await session(true)
    const cursor = z.number().int().positive().optional().parse(beforeId)
    return { success: true, records: await history(cursor, account.all ? undefined : account.id) }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.getOne, async (_, id: unknown) => {
  try {
    const account = await session(true)
    return {
      success: true,
      sale: await getSale(
        z.number().int().positive().parse(id),
        account.all ? undefined : account.id
      )
    }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.exportReceipt, async (event, id: unknown) => {
  try {
    const account = await session(true)
    const saleId = z.number().int().positive().parse(id)
    const sale = await getSale(saleId, account.all ? undefined : account.id)
    const selection = await windowDialog(event).showSaveDialog({
      title: 'Save sales receipt',
      defaultPath: `${receiptNumber(sale)}.pdf`,
      filters: [
        { name: 'PDF receipt (80 mm)', extensions: ['pdf'] },
        { name: 'Text receipt', extensions: ['txt'] }
      ]
    })
    if (selection.canceled || !selection.filePath) return { success: true, cancelled: true }
    const current = await session(true)
    if (current.id !== account.id)
      throw new SalesError('The signed-in account changed. Reopen the receipt.')
    const persisted = await getSale(saleId, current.all ? undefined : current.id)
    if (selection.filePath.toLowerCase().endsWith('.txt'))
      await writeFile(selection.filePath, receiptPlainText(persisted), 'utf8')
    else await writeFile(selection.filePath, await receiptPdf(receiptHtml(persisted)))
    return { success: true }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.void, async (_, payload: unknown) => {
  try {
    const account = await session(true)
    const actor = state.session!.account
    const sale = await voidSale(
      voidSaleSchema.parse(payload),
      { id: actor.id, fullName: actor.fullName, role: actor.role },
      account.all ? undefined : account.id
    )
    state.database.stale = true
    return { success: true, sale }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.cashCountPreview, async () => {
  try {
    const account = await session()
    return { success: true, preview: await cashCountPreview(account.id) }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.recordCashCount, async (_, payload: unknown) => {
  try {
    await session()
    const actor = state.session!.account
    const count = await recordCashCount(cashCountSchema.parse(payload), actor)
    state.database.stale = true
    return { success: true, count, data: count.id }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.sales.cashCounts, async (_, payload: unknown) => {
  try {
    const account = await session(true)
    const range = z
      .strictObject({ from: isoDateSchema('Enter a start date.'), to: isoDateSchema('Enter an end date.') })
      .parse(payload)
    const all = accessControl.can(state.session!.account.role).readAny(resources.cashCount).granted
    return {
      success: true,
      counts: await findCashCounts(range.from, range.to, all ? undefined : account.id)
    }
  } catch (error) {
    return failure(error)
  }
})
