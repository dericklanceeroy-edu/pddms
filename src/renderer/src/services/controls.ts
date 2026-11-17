import { channels } from '@shared/constants'
import type {
  CashCountInput,
  CashCountPreview,
  CashCountRecord,
  CreditNoteInput,
  CreditNoteRecord,
  DrugRegister,
  DuplicateMatch,
  NewPack,
  PackPrice,
  PriceDifferenceRecord,
  StockCountDetails,
  StockCountRecord,
  SupplierPackRecord,
  SupplierReturnInput,
  SupplierReturnRecord,
  VoidSale
} from '@shared/controls'

import type { SaleRecord } from '@shared/sales'

/**
 * Requests for the controls added from the November 15 fix list. A refused request throws a
 * RequestError that keeps the extra details the main process sends back, such as matching
 * duplicate records or whether a record can be archived instead of deleted.
 */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly duplicates: DuplicateMatch[] = [],
    readonly archivable = false
  ) {
    super(message)
  }
}

interface Response {
  success: boolean
  error?: string
  duplicates?: DuplicateMatch[]
  archivable?: boolean
  cancelled?: boolean
  [key: string]: unknown
}

export async function request<T = Response>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await window.electron.ipcRenderer.invoke(channel, ...args)) as Response
  if (!result.success)
    throw new RequestError(
      result.error ?? 'The request could not be completed.',
      result.duplicates ?? [],
      result.archivable ?? false
    )
  return result as T
}

// Supplier price list.
export const getPriceList = async (): Promise<SupplierPackRecord[]> =>
  (await request<{ packs: SupplierPackRecord[] }>(channels.priceList.getAll)).packs
export const createPack = async (values: NewPack): Promise<number> =>
  (await request<{ data: number }>(channels.priceList.createPack, values)).data
export const updatePackPrice = async (values: PackPrice): Promise<void> => {
  await request(channels.priceList.updatePrice, values)
}
export const setPackArchived = async (id: number, archived: boolean): Promise<void> => {
  await request(archived ? channels.priceList.archivePack : channels.priceList.restorePack, id)
}
export const getPriceDifferences = async (): Promise<PriceDifferenceRecord[]> =>
  (await request<{ records: PriceDifferenceRecord[] }>(channels.priceList.differences)).records

// Supplier returns and credit notes.
export const getSupplierReturns = (): Promise<{
  returns: SupplierReturnRecord[]
  creditNotes: CreditNoteRecord[]
}> => request(channels.supplierReturn.getAll)
export const recordSupplierReturn = async (values: SupplierReturnInput): Promise<void> => {
  await request(channels.supplierReturn.recordReturn, values)
}
export const recordCreditNote = async (values: CreditNoteInput): Promise<void> => {
  await request(channels.supplierReturn.recordCreditNote, values)
}
export const applyCreditNote = async (creditNoteId: number, purchaseOrderId: number): Promise<void> => {
  await request(channels.supplierReturn.applyCreditNote, { creditNoteId, purchaseOrderId })
}

// Voids and cash counts.
export const voidSale = async (values: VoidSale): Promise<SaleRecord> =>
  (await request<{ sale: SaleRecord }>(channels.sales.void, values)).sale
export const getCashCountPreview = async (): Promise<CashCountPreview> =>
  (await request<{ preview: CashCountPreview }>(channels.sales.cashCountPreview)).preview
export const recordCashCount = async (values: CashCountInput): Promise<CashCountRecord> =>
  (await request<{ count: CashCountRecord }>(channels.sales.recordCashCount, values)).count
export const getCashCounts = async (from: string, to: string): Promise<CashCountRecord[]> =>
  (await request<{ counts: CashCountRecord[] }>(channels.sales.cashCounts, { from, to })).counts

// Stock counts.
export const listStockCounts = async (): Promise<StockCountRecord[]> =>
  (await request<{ counts: StockCountRecord[] }>(channels.inventory.listCounts)).counts
export const getStockCount = async (id: number): Promise<StockCountDetails> =>
  (await request<{ count: StockCountDetails }>(channels.inventory.getCount, id)).count
export const startStockCount = async (drugId: number | null, notes: string): Promise<number> =>
  (await request<{ data: number }>(channels.inventory.startCount, { drugId, notes })).data
export const saveStockCountLines = async (
  countId: number,
  lines: Array<{ batchId: number; counted: number | null; reason: string }>
): Promise<void> => {
  await request(channels.inventory.recordCountLines, { countId, lines })
}
export const completeStockCount = async (id: number): Promise<void> => {
  await request(channels.inventory.completeCount, id)
}
export const cancelStockCount = async (id: number): Promise<void> => {
  await request(channels.inventory.cancelCount, id)
}
export const exportCountSheet = async (id: number): Promise<boolean> =>
  !(await request(channels.inventory.exportCountSheet, id)).cancelled

// Dangerous drugs register.
export const getRegister = async (drugId: number, from: string, to: string): Promise<DrugRegister> =>
  (await request<{ register: DrugRegister }>(channels.inventory.register, { drugId, from, to }))
    .register
export const exportRegister = async (drugId: number, from: string, to: string): Promise<boolean> =>
  !(await request(channels.inventory.exportRegister, { drugId, from, to })).cancelled

// Archive, restore and merge.
export interface ArchivedRecord {
  id: number
  label: string
  detail: string
}
export const archiveRecord = async (kind: 'customer' | 'product', id: number): Promise<void> => {
  await request(
    kind === 'customer' ? channels.customer.archiveOneById : channels.product.archiveOneById,
    id
  )
}
export const restoreRecord = async (kind: 'customer' | 'product', id: number): Promise<void> => {
  await request(
    kind === 'customer' ? channels.customer.restoreOneById : channels.product.restoreOneById,
    id
  )
}
export const mergeCustomers = async (sourceId: number, targetId: number): Promise<void> => {
  await request(channels.customer.mergeInto, { sourceId, targetId })
}
