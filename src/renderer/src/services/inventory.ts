import { channels } from '@shared/constants'
import type { StockOutRecord, StockOutValues } from '@shared/inventory'
import { stockOutSchema } from '@shared/schemas'
import { validate } from '@shared/validation'

interface InventoryResult {
  success: boolean
  error?: string
  cancelled?: boolean
  records?: StockOutRecord[]
}

export async function recordStockOut(values: StockOutValues): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.inventory.recordStockOut,
    validate(stockOutSchema, values)
  )) as InventoryResult
  if (!result.success) throw new Error(result.error ?? 'Unable to record stock-out.')
}

export async function getStockOuts(drugId: number): Promise<StockOutRecord[]> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.inventory.getStockOuts,
    drugId
  )) as InventoryResult
  if (!result.success) throw new Error(result.error ?? 'Unable to load stock-out history.')
  return result.records ?? []
}

export async function exportInventory(): Promise<boolean> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.inventory.exportReport
  )) as InventoryResult
  if (!result.success) throw new Error(result.error ?? 'Unable to export inventory.')
  return !result.cancelled
}
