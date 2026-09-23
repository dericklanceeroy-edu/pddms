import { accessControl, authorize } from '@main/access-control'
import { findOneById } from '@main/account/repository'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { SalesError } from '@shared/sales'
import {
  deliveryReceiptText,
  WholesaleError,
  wholesaleListSchema,
  wholesaleOrderSchema,
  wholesalePaymentSchema,
  wholesaleScheduleSchema
} from '@shared/wholesale'
import { dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import z from 'zod'
import * as repository from './repository'

async function session(
  operation: 'read' | 'create' | 'update' | 'pay' | 'alerts'
): Promise<{ id: number; financial: boolean }> {
  const id = state.session?.account.id
  if (!id) throw new WholesaleError('Sign in to use wholesale orders.')
  const account = await findOneById(id)
  if (state.session?.account.id !== id)
    throw new WholesaleError('The signed-in account changed. Try again.')
  if (!account || account.isArchived || !account.isVerified) {
    state.session = undefined
    throw new WholesaleError('Your session is no longer active. Sign in again.')
  }
  state.session = { account }
  authorize((current) => {
    const permission = accessControl.can(current.account.role)
    if (operation === 'pay') return permission.createAny(resources.receivable)
    if (operation === 'alerts') return permission.readAny(resources.receivable)
    if (operation === 'create') return permission.createAny(resources.wholesale)
    if (operation === 'update') return permission.updateAny(resources.wholesale)
    return permission.readAny(resources.wholesale)
  })
  return { id, financial: accessControl.can(account.role).readAny(resources.receivable).granted }
}
const idSchema = z.number().int().positive()
type Operation = Parameters<typeof session>[0]
function handle(
  channel: string,
  operation: Operation,
  action: (payload: unknown, account: Awaited<ReturnType<typeof session>>) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (_, payload: unknown) => {
    try {
      const account = await session(operation)
      const data = await action(payload, account)
      if (['create', 'update', 'pay'].includes(operation)) state.database.stale = true
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof WholesaleError || error instanceof SalesError
            ? error.message
            : error instanceof z.ZodError
              ? error.issues
                  .map((issue) => `${issue.path.join('.') || 'Order'}: ${issue.message}`)
                  .join(' ')
              : 'Wholesale operation failed or access denied. Reload the order before retrying.'
      }
    }
  })
}
handle(channels.wholesale.list, 'read', (payload, account) =>
  repository.listOrders(wholesaleListSchema.parse(payload), account.financial)
)
handle(channels.wholesale.get, 'read', (payload, account) =>
  repository.getOrder(idSchema.parse(payload), account.financial)
)
handle(channels.wholesale.create, 'create', (payload, account) =>
  repository.createOrder(wholesaleOrderSchema.parse(payload), account.id)
)
handle(channels.wholesale.schedule, 'update', (payload, account) =>
  repository.scheduleOrder(wholesaleScheduleSchema.parse(payload), account.id)
)
handle(channels.wholesale.deliver, 'update', (payload, account) =>
  repository.deliverOrder(idSchema.parse(payload), account.id)
)
handle(channels.wholesale.cancel, 'update', (payload, account) =>
  repository.cancelOrder(idSchema.parse(payload), account.id)
)
handle(channels.wholesale.pay, 'pay', (payload, account) =>
  repository.recordPayment(wholesalePaymentSchema.parse(payload), account.id)
)
handle(channels.wholesale.alerts, 'alerts', () => repository.overdueSummary())
handle(channels.wholesale.exportReceipt, 'read', async (payload, account) => {
  const id = idSchema.parse(payload)
  const order = await repository.getOrder(id, false)
  const text = deliveryReceiptText(order)
  const selected = await dialog.showSaveDialog({
    title: 'Save delivery receipt',
    defaultPath: `DR-${order.reference}.txt`,
    filters: [{ name: 'Text receipt', extensions: ['txt'] }]
  })
  if (selected.canceled || !selected.filePath) return false
  const current = await session('read')
  if (current.id !== account.id)
    throw new WholesaleError('The signed-in account changed. Reopen the receipt.')
  await writeFile(selected.filePath, text, 'utf8')
  return true
})
