import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { channels, resources } from '@shared/constants'
import { newPackSchema, packPriceSchema } from '@shared/controls'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import {
  createPack,
  findPriceDifferences,
  findPriceList,
  setPackArchived,
  setPackPrice
} from './repository'

// Note: Staff placing orders can read the list; only the owner/administrator can change it.
ipcMain.handle(channels.priceList.getAll, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.priceList))
    return { success: true, packs: await findPriceList() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.priceList.differences, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.priceList))
    return { success: true, records: await findPriceDifferences() }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.priceList.createPack, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.priceList))
    const data = await createPack(newPackSchema.parse(payload), state.session!.account.id)
    state.database.stale = true
    return { success: true, data }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.priceList.updatePrice, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.priceList))
    const data = packPriceSchema.parse(payload)
    await setPackPrice(data, state.session!.account.id)
    state.database.stale = true
    return { success: true, data: data.packId }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

for (const [channel, archived] of [
  [channels.priceList.archivePack, true],
  [channels.priceList.restorePack, false]
] as const)
  ipcMain.handle(channel, async (_, id: unknown) => {
    try {
      authorize((session) => accessControl.can(session.account.role).updateAny(resources.priceList))
      if (!isId(id)) return { success: false, error: 'Invalid pack.' }
      await setPackArchived(id, archived)
      state.database.stale = true
      return { success: true }
    } catch (error) {
      return { success: false, error: formatValidationError(error) }
    }
  })
