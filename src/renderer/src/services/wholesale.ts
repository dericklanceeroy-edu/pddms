import { channels } from '@shared/constants'
import type {
  WholesaleDetails,
  WholesaleDraft,
  WholesaleFilter,
  WholesalePaymentInput,
  WholesaleSchedule,
  WholesaleSummary
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
  request(channels.wholesale.create, data)
export const scheduleWholesale = (data: WholesaleSchedule): Promise<void> =>
  request(channels.wholesale.schedule, data)
export const deliverWholesale = (id: number): Promise<void> =>
  request(channels.wholesale.deliver, id)
export const cancelWholesale = (id: number): Promise<void> => request(channels.wholesale.cancel, id)
export const payWholesale = (data: WholesalePaymentInput): Promise<void> =>
  request(channels.wholesale.pay, data)
export const wholesaleAlerts = (): Promise<{ count: number; remainingCents: number }> =>
  request(channels.wholesale.alerts)
export const exportDeliveryReceipt = (id: number): Promise<boolean> =>
  request(channels.wholesale.exportReceipt, id)
