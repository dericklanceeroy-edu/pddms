import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { channels, resources } from '@shared/constants'
import { formatValidationError } from '@shared/validation'
import { applyCreditNote, findReturns, recordCreditNote, recordReturn } from './repository'

// Note: Stock leaving for a supplier and changes to what is owed are the administrator's.
const allow = (create: boolean): void => {
  authorize((session) =>
    create
      ? accessControl.can(session.account.role).createAny(resources.supplierReturn)
      : accessControl.can(session.account.role).readAny(resources.supplierReturn)
  )
}

ipcMain.handle(channels.supplierReturn.getAll, async () => {
  try {
    allow(false)
    return { success: true, ...(await findReturns()) }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.supplierReturn.recordReturn, async (_, payload: unknown) => {
  try {
    allow(true)
    const data = await recordReturn(payload as never, state.session!.account.id)
    state.database.stale = true
    return { success: true, data }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.supplierReturn.recordCreditNote, async (_, payload: unknown) => {
  try {
    allow(true)
    const data = await recordCreditNote(payload as never, state.session!.account.id)
    state.database.stale = true
    return { success: true, data }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.supplierReturn.applyCreditNote, async (_, payload: unknown) => {
  try {
    allow(true)
    await applyCreditNote(payload)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
