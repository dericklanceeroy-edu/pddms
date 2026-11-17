import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { localDate } from '@shared/inventory'
import { stockOutSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { windowDialog } from '@main/api/dialogs'
import { ipcMain } from '@main/api/ipc'
import { writeFile } from 'node:fs/promises'
import { a4Pdf } from '@main/api/receipt-pdf'
import { isoDateSchema } from '@shared/schemas'
import z from 'zod'
import {
  cancelCount,
  completeCount,
  countSheetHtml,
  drugRegister,
  getCount,
  listCounts,
  recordCountLines,
  registerCsv,
  registerHtml,
  startCount
} from './controls'
import { findStockOuts, inventoryCsv, recordStockOut } from './repository'

ipcMain.handle(channels.inventory.recordStockOut, async (_, payload: unknown) => {
  try {
    authorize((session) =>
      accessControl.can(session.account.role).createAny(resources.inventoryAdjustment)
    )
    await recordStockOut(stockOutSchema.parse(payload), state.session!.account.id)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.inventory.getStockOuts, async (_, drugId: unknown) => {
  try {
    authorize((session) =>
      accessControl.can(session.account.role).readAny(resources.inventoryAdjustment)
    )
    if (!isId(drugId)) throw new Error('Invalid product.')
    return { success: true, records: await findStockOuts(drugId) }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.inventory.exportReport, async (event) => {
  try {
    authorize((session) =>
      accessControl.can(session.account.role).readAny(resources.inventoryAdjustment)
    )
    const selection = await windowDialog(event).showSaveDialog({
      title: 'Export current inventory',
      defaultPath: `inventory-${localDate()}.csv`,
      filters: [{ name: 'CSV report', extensions: ['csv'] }]
    })
    if (selection.canceled || !selection.filePath) return { success: true, cancelled: true }
    authorize((session) =>
      accessControl.can(session.account.role).readAny(resources.inventoryAdjustment)
    )
    await writeFile(selection.filePath, await inventoryCsv(), 'utf8')
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

const adjust = (): void => {
  authorize((session) =>
    accessControl.can(session.account.role).createAny(resources.inventoryAdjustment)
  )
}

ipcMain.handle(channels.inventory.listCounts, async () => {
  try {
    adjust()
    return { success: true, counts: await listCounts() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
ipcMain.handle(channels.inventory.getCount, async (_, id: unknown) => {
  try {
    adjust()
    if (!isId(id)) throw new Error('Invalid stock count.')
    return { success: true, count: await getCount(id) }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
ipcMain.handle(channels.inventory.startCount, async (_, payload: unknown) => {
  try {
    adjust()
    const data = await startCount(payload, state.session!.account.id)
    state.database.stale = true
    return { success: true, data }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
ipcMain.handle(channels.inventory.recordCountLines, async (_, payload: unknown) => {
  try {
    adjust()
    await recordCountLines(payload)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
ipcMain.handle(channels.inventory.completeCount, async (_, id: unknown) => {
  try {
    adjust()
    if (!isId(id)) throw new Error('Invalid stock count.')
    const data = await completeCount(id, state.session!.account.id)
    state.database.stale = true
    return { success: true, data }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
ipcMain.handle(channels.inventory.cancelCount, async (_, id: unknown) => {
  try {
    adjust()
    if (!isId(id)) throw new Error('Invalid stock count.')
    await cancelCount(id, state.session!.account.id)
    state.database.stale = true
    return { success: true, data: id }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
ipcMain.handle(channels.inventory.exportCountSheet, async (event, id: unknown) => {
  try {
    adjust()
    if (!isId(id)) throw new Error('Invalid stock count.')
    const count = await getCount(id)
    const selection = await windowDialog(event).showSaveDialog({
      title: 'Save stock count sheet',
      defaultPath: `stock-count-${id}.pdf`,
      filters: [{ name: 'PDF count sheet', extensions: ['pdf'] }]
    })
    if (selection.canceled || !selection.filePath) return { success: true, cancelled: true }
    await writeFile(selection.filePath, await a4Pdf(countSheetHtml(count)))
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

// Note: The register is a regulatory record, so it is for the administrator (reports access).
const registerQuery = z
  .strictObject({
    drugId: z.number().int().positive(),
    from: isoDateSchema('Enter a start date.'),
    to: isoDateSchema('Enter an end date.')
  })
  // Note: A reversed range is an input mistake, not an empty register (L8).
  .refine((value) => value.from <= value.to, {
    path: ['to'],
    message: 'The end date must be on or after the start date.'
  })
ipcMain.handle(channels.inventory.register, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.report))
    const { drugId, from, to } = registerQuery.parse(payload)
    return { success: true, register: await drugRegister(drugId, from, to) }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
ipcMain.handle(channels.inventory.exportRegister, async (event, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.report))
    const { drugId, from, to } = registerQuery.parse(payload)
    const register = await drugRegister(drugId, from, to)
    const selection = await windowDialog(event).showSaveDialog({
      title: 'Save dangerous drugs register',
      defaultPath: `dd-register-${drugId}-${from}-${to}.pdf`,
      filters: [
        { name: 'PDF register', extensions: ['pdf'] },
        { name: 'CSV register', extensions: ['csv'] }
      ]
    })
    if (selection.canceled || !selection.filePath) return { success: true, cancelled: true }
    if (selection.filePath.toLowerCase().endsWith('.csv'))
      await writeFile(selection.filePath, registerCsv(register), 'utf8')
    else
      await writeFile(
        selection.filePath,
        await a4Pdf(registerHtml(register, state.session!.account.fullName), true)
      )
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
