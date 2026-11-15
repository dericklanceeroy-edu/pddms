import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { customerUpdateSchema, newCustomerSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { ipcMain } from '@main/api/ipc'
import { findAll, findOneById, insertOne, removeOneById, updateOneById } from './repository'

// Note: Cashiers serve retail customers only; pharmacy clients belong to Wholesale & Deliveries.
const cashier = (): boolean => state.session?.account.role === 'cashier'
const pharmacyOnlyMessage = 'Pharmacy clients are managed in Wholesale & Deliveries.'

ipcMain.handle(channels.customer.getAll, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.customer))
    return {
      success: true,
      customers: await findAll(
        state.session!.account.role === 'master' ? undefined : state.session!.account.id,
        cashier()
      )
    }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.customer.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.customer))
    const data = newCustomerSchema.parse(payload)
    if (cashier() && data.clientType === 'pharmacy') return { success: false, error: pharmacyOnlyMessage }
    const customer = await insertOne(data)
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
    const data = customerUpdateSchema.parse(payload)
    if (cashier()) {
      const current = await findOneById(id)
      if (current?.clientType === 'pharmacy' || data.clientType === 'pharmacy')
        return { success: false, error: pharmacyOnlyMessage }
    }
    const customer = await updateOneById(id, data)
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
