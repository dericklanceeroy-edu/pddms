import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import {
  newPurchaseOrderSchema,
  purchaseOrderDeliverySchema,
  purchaseOrderStatusUpdateSchema
} from '@shared/schemas'
import { isId } from '@shared/validators'
import { ipcMain } from 'electron'
import {
  findAll,
  findOneById,
  getById,
  insertOne,
  recordDelivery,
  removeOneById,
  updateStatusById
} from './repository'

ipcMain.handle(channels.purchaseOrder.getAll, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.purchaseOrder))
    return { success: true, orders: await findAll() }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(channels.purchaseOrder.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) =>
      accessControl.can(session.account.role).createAny(resources.purchaseOrder)
    )
    const accountId = state.session?.account.id
    if (!accountId) return { success: false, error: 'Session not found.' }
    const data = newPurchaseOrderSchema.parse(payload)
    const order = await insertOne({
      ...data,
      expectedAt: data.expectedAt ?? null,
      notes: data.notes ?? null,
      createdBy: accountId
    })
    state.database.stale = true
    return { success: true, order }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle(
  channels.purchaseOrder.updateStatusById,
  async (_, id: unknown, payload: unknown) => {
    try {
      authorize((session) =>
        accessControl.can(session.account.role).updateAny(resources.purchaseOrder)
      )
      if (!isId(id)) return { success: false, error: 'Invalid purchase order.' }
      const currentOrder = await findOneById(id)
      if (!currentOrder) return { success: false, error: 'Purchase order not found.' }
      const nextStatus = purchaseOrderStatusUpdateSchema.parse(payload).status
      if (currentOrder.status === 'received' && nextStatus !== 'received') {
        return { success: false, error: 'A received order cannot move backwards.' }
      }
      if (currentOrder.status === 'cancelled' && nextStatus !== 'cancelled') {
        return { success: false, error: 'A cancelled order cannot be reopened.' }
      }
      if (
        nextStatus === 'received' &&
        currentOrder.items.some((item) => item.receivedQuantity < item.quantity)
      ) {
        return { success: false, error: 'Receive all order lines before marking it received.' }
      }
      const order = await updateStatusById(id, nextStatus)
      state.database.stale = true
      return { success: true, order }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
)

ipcMain.handle(
  channels.purchaseOrder.recordDeliveryById,
  async (_, id: unknown, payload: unknown) => {
    try {
      authorize((session) =>
        accessControl.can(session.account.role).updateAny(resources.purchaseOrder)
      )
      if (!isId(id)) return { success: false, error: 'Invalid purchase order.' }
      const currentOrder = await findOneById(id)
      if (!currentOrder) return { success: false, error: 'Purchase order not found.' }
      if (['cancelled', 'received'].includes(currentOrder.status)) {
        return { success: false, error: 'This order cannot receive another delivery.' }
      }
      const data = purchaseOrderDeliverySchema.parse(payload)
      const order = await recordDelivery(id, data.items)
      state.database.stale = true
      return { success: true, order }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
)

ipcMain.handle(channels.purchaseOrder.removeOneById, async (_, id: unknown) => {
  try {
    authorize((session) =>
      accessControl.can(session.account.role).deleteAny(resources.purchaseOrder)
    )
    if (!isId(id)) return { success: false, error: 'Invalid purchase order.' }
    const order = await getById(id)
    if (!order) return { success: false, error: 'Purchase order not found.' }
    if (!['draft', 'cancelled'].includes(order.status)) {
      return { success: false, error: 'Only draft or cancelled orders can be deleted.' }
    }
    await removeOneById(id)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
