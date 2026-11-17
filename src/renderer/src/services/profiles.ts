import type {
  CustomerDraft,
  CustomerProfile,
  ItemDraft,
  ItemProfile
} from '@renderer/data/profiles'
import { channels } from '@shared/constants'
import {
  batchWholesalePriceSchema,
  customerUpdateSchema,
  newCustomerSchema,
  newDrugSchema,
  productUpdateSchema
} from '@shared/schemas'
import { validate } from '@shared/validation'
import { request } from './controls'

interface Result<T> {
  success: boolean
  error?: string
  customers?: CustomerProfile[]
  customer?: T
  products?: ItemProfile[]
  product?: T
}

interface CustomerPayload extends Omit<
  CustomerDraft,
  'email' | 'address' | 'discountId' | 'contactPerson' | 'tin'
> {
  contactPerson: string | null
  email: string | null
  address: string | null
  discountId: string | null
  tin: string | null
}

const customerPayload = (customer: CustomerDraft): CustomerPayload => ({
  ...customer,
  email: customer.email || null,
  address: customer.address || null,
  discountId: customer.discountId || null,
  contactPerson: customer.contactPerson || null,
  tin: customer.clientType === 'pharmacy' ? customer.tin || null : null
})

const mapCustomer = (customer: CustomerProfile): CustomerProfile => ({
  ...customer,
  email: customer.email ?? '',
  address: customer.address ?? '',
  discountId: customer.discountId ?? '',
  clientType: customer.clientType ?? 'retail',
  contactPerson: customer.contactPerson ?? '',
  tin: customer.tin ?? '',
  transactions: customer.transactions ?? []
})

const mapProduct = (
  product: ItemProfile & { isPrescribed?: boolean; isControlled?: boolean }
): ItemProfile => ({
  ...product,
  prescriptionRequired: product.isPrescribed ?? product.prescriptionRequired,
  controlled: product.isControlled ?? product.controlled,
  genericEquivalentIds: [],
  batches: product.batches.map((batch) => ({
    ...batch,
    boxSellPrice: batch.boxSellPrice ?? null,
    wholesaleBoxPrice: batch.wholesaleBoxPrice ?? null,
    piecesPerBox: Math.max(1, batch.piecesPerBox ?? 1),
    expiresAt: String(batch.expiresAt)
  }))
})

export async function getCustomers(): Promise<CustomerProfile[]> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.customer.getAll
  )) as Result<never>
  if (!result.success) throw new Error(result.error ?? 'Unable to load customers.')
  return (result.customers ?? []).map(mapCustomer)
}

/**
 * Saves a customer or pharmacy client. When a similar record already exists the request is
 * refused with a RequestError listing the matches; saving again with `confirmDuplicate` keeps
 * both (for example two different people with the same name).
 */
export async function saveCustomer(
  customer: CustomerDraft,
  id?: number,
  confirmDuplicate = false
): Promise<CustomerProfile> {
  const channel = id ? channels.customer.updateOneById : channels.customer.createOne
  const payload = validate(id ? customerUpdateSchema : newCustomerSchema, customerPayload(customer))
  const flags = { confirmDuplicate }
  const args = id ? [id, payload, flags] : [payload, flags]
  const result = await request<Result<CustomerProfile>>(channel, ...args)
  return mapCustomer(result.customer!)
}

export async function getArchivedCustomers(): Promise<CustomerProfile[]> {
  return ((await request<Result<never>>(channels.customer.getArchived)).customers ?? []).map(
    mapCustomer
  )
}

export async function getArchivedProducts(): Promise<ItemProfile[]> {
  return ((await request<Result<never>>(channels.product.getArchived)).products ?? []).map(
    mapProduct
  )
}

/** Deletes a never-used record; throws a RequestError (archivable) when it has history. */
export async function removeCustomer(id: number): Promise<void> {
  await request(channels.customer.removeOneById, id)
}

export async function getProducts(): Promise<ItemProfile[]> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.product.getAll
  )) as Result<never>
  if (!result.success) throw new Error(result.error ?? 'Unable to load products.')
  const products = (result.products ?? []).map(mapProduct)
  return products.map((product) => ({
    ...product,
    genericEquivalentIds: products
      .filter(
        (candidate) =>
          candidate.id !== product.id &&
          candidate.genericName.toLowerCase() === product.genericName.toLowerCase() &&
          candidate.formulation.toLowerCase() === product.formulation.toLowerCase()
      )
      .map((candidate) => candidate.id)
  }))
}

export async function addProduct(product: ItemDraft): Promise<ItemProfile> {
  const payload = validate(newDrugSchema, {
    category: product.category,
    genericName: product.genericName,
    brandName: product.brandName,
    formulation: product.formulation,
    isPrescribed: product.prescriptionRequired,
    isControlled: product.controlled,
    reorderLevel: product.reorderLevel
  })
  const result = (await window.electron.ipcRenderer.invoke(channels.product.createOne, {
    ...payload
  })) as Result<ItemProfile>
  if (!result.success || !result.product) {
    throw new Error(result.error ?? 'Unable to add the product.')
  }
  return mapProduct(result.product)
}

export async function updateProduct(id: number, product: ItemDraft): Promise<ItemProfile> {
  const payload = validate(productUpdateSchema, {
    category: product.category,
    genericName: product.genericName,
    brandName: product.brandName,
    formulation: product.formulation,
    isPrescribed: product.prescriptionRequired,
    isControlled: product.controlled,
    reorderLevel: product.reorderLevel
  })
  const result = (await window.electron.ipcRenderer.invoke(channels.product.updateOneById, id, {
    ...payload
  })) as Result<ItemProfile>
  if (!result.success || !result.product) {
    throw new Error(result.error ?? 'Unable to update the product.')
  }
  return mapProduct(result.product)
}

/** Deletes a never-used product; throws a RequestError (archivable) when it has history. */
export async function removeProduct(id: number): Promise<void> {
  await request(channels.product.removeOneById, id)
}

/** Sets or clears the price of one box for pharmacy clients on one batch. */
export async function setWholesalePrice(batchId: number, price: number | null): Promise<void> {
  const payload = validate(batchWholesalePriceSchema, { batchId, wholesaleBoxPrice: price })
  const result = (await window.electron.ipcRenderer.invoke(
    channels.product.setWholesalePrice,
    payload
  )) as Result<never>
  if (!result.success) throw new Error(result.error ?? 'Unable to save the wholesale price.')
}
