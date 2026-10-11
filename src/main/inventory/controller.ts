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
