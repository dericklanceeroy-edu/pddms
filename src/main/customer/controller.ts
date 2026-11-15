import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { customerUpdateSchema, newCustomerSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { ipcMain } from '@main/api/ipc'
import { mergeCustomersSchema } from '@shared/controls'
import z from 'zod'
import {
  deleteBlock,
  DuplicateWarning,
  findAll,
  findArchived,
  findOneById,
  insertOne,
  mergeInto,
  removeOneById,
  setArchived,
  updateOneById
} from './repository'

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

const options = z
  .strictObject({ confirmDuplicate: z.boolean().default(false) })
  .default({ confirmDuplicate: false })
const failure = (error: unknown): Record<string, unknown> =>
  error instanceof DuplicateWarning
    ? { success: false, error: error.message, duplicates: error.matches }
    : { success: false, error: formatValidationError(error) }

ipcMain.handle(channels.customer.createOne, async (_, payload: unknown, flags: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.customer))
    const data = newCustomerSchema.parse(payload)
    if (cashier() && data.clientType === 'pharmacy') return { success: false, error: pharmacyOnlyMessage }
    const customer = await insertOne(data, options.parse(flags).confirmDuplicate)
    state.database.stale = true
    return { success: true, customer }
  } catch (error) {
    return failure(error)
  }
})

ipcMain.handle(
  channels.customer.updateOneById,
  async (_, id: unknown, payload: unknown, flags: unknown) => {
    try {
      authorize((session) => accessControl.can(session.account.role).updateAny(resources.customer))
      if (!isId(id)) return { success: false, error: 'Invalid customer.' }
      const data = customerUpdateSchema.parse(payload)
      if (cashier()) {
        const current = await findOneById(id)
        if (current?.clientType === 'pharmacy' || data.clientType === 'pharmacy')
          return { success: false, error: pharmacyOnlyMessage }
      }
      const customer = await updateOneById(id, data, options.parse(flags).confirmDuplicate)
      state.database.stale = true
      return { success: true, customer }
    } catch (error) {
      return failure(error)
    }
  }
)

ipcMain.handle(channels.customer.removeOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.customer))
    if (!isId(id)) return { success: false, error: 'Invalid customer.' }
    // Note: Records with history are archived instead; the reason is shown with an Archive button.
    const block = await deleteBlock(id)
    if (block) return { success: false, error: block.reason, archivable: block.archivable }
    await removeOneById(id)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return failure(error)
  }
})

ipcMain.handle(channels.customer.archiveOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.customer))
    if (!isId(id)) return { success: false, error: 'Invalid customer.' }
    await setArchived(id, true)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return failure(error)
  }
})

// Note: Restoring, listing archived records and merging duplicates are for the administrator.
const admin = (): void => {
  authorize((session) => accessControl.can(session.account.role).readAny(resources.administration))
}
ipcMain.handle(channels.customer.restoreOneById, async (_, id: unknown) => {
  try {
    admin()
    if (!isId(id)) return { success: false, error: 'Invalid customer.' }
    await setArchived(id, false)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.customer.getArchived, async () => {
  try {
    admin()
    return { success: true, customers: await findArchived() }
  } catch (error) {
    return failure(error)
  }
})
ipcMain.handle(channels.customer.mergeInto, async (_, payload: unknown) => {
  try {
    admin()
    const { sourceId, targetId } = mergeCustomersSchema.parse(payload)
    await mergeInto(sourceId, targetId)
    state.database.stale = true
    return { success: true, data: targetId }
  } catch (error) {
    return failure(error)
  }
})
