import { channels } from '@shared/constants'
import { validate } from '@shared/validation'
import type {
  WholesaleDelivery,
  WholesaleDetails,
  WholesaleDraft,
  WholesaleFilter,
  WholesalePaymentInput,
  WholesaleSchedule,
  WholesaleSummary
} from '@shared/wholesale'
import {
  wholesaleDeliverSchema,
  wholesaleOrderSchema,
  wholesalePaymentSchema,
  wholesaleScheduleSchema
} from '@shared/wholesale'

async function request<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await window.electron.ipcRenderer.invoke(channel, payload)) as {
    success: boolean
    error?: string
    data: T
  }
  if (!result.success) throw new Error(result.error ?? 'Unable to complete wholesale operation.')
  return result.data
}
export const listWholesale = (filter: WholesaleFilter): Promise<WholesaleSummary[]> =>
  request(channels.wholesale.list, filter)
export const getWholesale = (id: number): Promise<WholesaleDetails> =>
  request(channels.wholesale.get, id)
export const createWholesale = (data: WholesaleDraft): Promise<number> =>
  request(channels.wholesale.create, validate(wholesaleOrderSchema, data))
export const scheduleWholesale = (data: WholesaleSchedule): Promise<void> =>
  request(channels.wholesale.schedule, validate(wholesaleScheduleSchema, data))
export const deliverWholesale = (data: WholesaleDelivery): Promise<void> =>
  request(channels.wholesale.deliver, validate(wholesaleDeliverSchema, data))
export const cancelWholesale = (id: number): Promise<void> => request(channels.wholesale.cancel, id)
export const payWholesale = (data: WholesalePaymentInput): Promise<void> =>
  request(channels.wholesale.pay, validate(wholesalePaymentSchema, data))
export const wholesaleAlerts = (): Promise<{ count: number; remainingCents: number }> =>
  request(channels.wholesale.alerts)
export const exportDeliveryReceipt = (id: number): Promise<boolean> =>
  request(channels.wholesale.exportReceipt, id)
