import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { newSupplierSchema, supplierUpdateSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { ipcMain } from 'electron'
import {
  countBatchesBySupplier,
  countOrdersBySupplier,
  findAll,
  insertOne,
  removeOneById,
  updateOneById
} from './repository'

ipcMain.handle(channels.supplier.getAll, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.supplier))
    return { success: true, suppliers: await findAll() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.supplier.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.supplier))
    const supplier = await insertOne(newSupplierSchema.parse(payload))
    state.database.stale = true
    return { success: true, supplier }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.supplier.updateOneById, async (_, id: unknown, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.supplier))
    if (!isId(id)) return { success: false, error: 'Invalid supplier.' }
    const supplier = await updateOneById(id, supplierUpdateSchema.parse(payload))
    state.database.stale = true
    return { success: true, supplier }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.supplier.removeOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.supplier))
    if (!isId(id)) return { success: false, error: 'Invalid supplier.' }
    if ((await countOrdersBySupplier(id)) > 0 || (await countBatchesBySupplier(id)) > 0) {
      return { success: false, error: 'Suppliers with orders or stock batches cannot be deleted.' }
    }
    await removeOneById(id)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
