import { accessControl, authorize } from '@main/access-control'
import { findOneById } from '@main/account/repository'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { checkoutSchema, receiptText, saleDraftSchema, SalesError } from '@shared/sales'
import { dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import z from 'zod'
import { checkout, getSale, history, quote } from './repository'

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
      : error instanceof z.ZodError
        ? error.issues
            .map((issue) => `${issue.path.join('.') || 'Cart'}: ${issue.message}`)
            .join(' ')
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
ipcMain.handle(channels.sales.exportReceipt, async (_, id: unknown) => {
  try {
    const account = await session(true)
    const saleId = z.number().int().positive().parse(id)
    const sale = await getSale(saleId, account.all ? undefined : account.id)
    const selection = await dialog.showSaveDialog({
      title: 'Save sales receipt',
      defaultPath: `${sale.reference}.txt`,
      filters: [{ name: 'Text receipt', extensions: ['txt'] }]
    })
    if (selection.canceled || !selection.filePath) return { success: true, cancelled: true }
    const current = await session(true)
    if (current.id !== account.id)
      throw new SalesError('The signed-in account changed. Reopen the receipt.')
    const persisted = await getSale(saleId, current.all ? undefined : current.id)
    await writeFile(selection.filePath, receiptText(persisted), 'utf8')
    return { success: true }
  } catch (error) {
    return failure(error)
  }
})
