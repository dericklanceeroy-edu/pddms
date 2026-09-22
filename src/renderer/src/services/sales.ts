import { channels } from '@shared/constants'
import type { Checkout, SaleDraft, SaleRecord, SaleTotals } from '@shared/sales'

interface Result {
  success: boolean
  error?: string
  sale?: SaleRecord
  records?: Omit<SaleRecord, 'items'>[]
  totals?: SaleTotals
  cancelled?: boolean
}
async function request(channel: string, payload?: unknown): Promise<Result> {
  const result = (await window.electron.ipcRenderer.invoke(channel, payload)) as Result
  if (!result.success) throw new Error(result.error ?? 'Sales request failed.')
  return result
}
export const quoteSale = async (draft: SaleDraft): Promise<SaleTotals> =>
  (await request(channels.sales.quote, draft)).totals!
export const completeSale = async (data: Checkout): Promise<SaleRecord> =>
  (await request(channels.sales.checkout, data)).sale!
export const getSaleHistory = async (beforeId?: number): Promise<Omit<SaleRecord, 'items'>[]> =>
  (await request(channels.sales.history, beforeId)).records!
export const getSale = async (id: number): Promise<SaleRecord> =>
  (await request(channels.sales.getOne, id)).sale!
export const exportReceipt = async (id: number): Promise<boolean> =>
  !(await request(channels.sales.exportReceipt, id)).cancelled
