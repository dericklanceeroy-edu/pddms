import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { customerUpdateSchema, newCustomerSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { ipcMain } from 'electron'
import { findAll, insertOne, removeOneById, updateOneById } from './repository'

ipcMain.handle(channels.customer.getAll, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.customer))
    return { success: true, customers: await findAll() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.customer.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.customer))
    const customer = await insertOne(newCustomerSchema.parse(payload))
    state.database.stale = true
    return { success: true, customer }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.customer.updateOneById, async (_, id: unknown, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.customer))
    if (!isId(id)) return { success: false, error: 'Invalid customer.' }
    const customer = await updateOneById(id, customerUpdateSchema.parse(payload))
    state.database.stale = true
    return { success: true, customer }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.customer.removeOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.customer))
    if (!isId(id)) return { success: false, error: 'Invalid customer.' }
    await removeOneById(id)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
