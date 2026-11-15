import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { batchWholesalePriceSchema, newDrugSchema, productUpdateSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { ipcMain } from '@main/api/ipc'
import {
  deleteBlock,
  findAll,
  findArchived,
  insertOne,
  removeOneById,
  setArchived,
  setWholesalePrice,
  updateOneById
} from './repository'

ipcMain.handle(channels.product.getAll, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.product))
    return { success: true, products: await findAll() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.product.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.product))
    const product = await insertOne(newDrugSchema.parse(payload))
    state.database.stale = true
    return { success: true, product: { ...product, batches: [] } }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.product.updateOneById, async (_, id: unknown, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.product))
    if (!isId(id)) return { success: false, error: 'Invalid product.' }
    const product = await updateOneById(id, productUpdateSchema.parse(payload))
    state.database.stale = true
    return { success: true, product: { ...product, batches: [] } }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.product.removeOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.product))
    if (!isId(id)) return { success: false, error: 'Invalid product.' }
    // Note: A product with history is never deleted; the reason is shown and Archive is offered.
    const block = await deleteBlock(id)
    if (block) return { success: false, error: block.reason, archivable: block.archivable }
    await removeOneById(id)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.product.archiveOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.product))
    if (!isId(id)) return { success: false, error: 'Invalid product.' }
    await setArchived(id, true)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

// Note: Only the administrator sees archived products and brings them back.
ipcMain.handle(channels.product.restoreOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.administration))
    if (!isId(id)) return { success: false, error: 'Invalid product.' }
    await setArchived(id, false)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.product.getArchived, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.administration))
    return { success: true, products: await findArchived() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.product.setWholesalePrice, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.product))
    const { batchId, wholesaleBoxPrice } = batchWholesalePriceSchema.parse(payload)
    await setWholesalePrice(batchId, wholesaleBoxPrice)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
