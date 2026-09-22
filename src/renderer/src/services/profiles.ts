import type {
  CustomerDraft,
  CustomerProfile,
  ItemDraft,
  ItemProfile
} from '@renderer/data/profiles'
import { channels } from '@shared/constants'
import {
  customerUpdateSchema,
  newCustomerSchema,
  newDrugSchema,
  productUpdateSchema
} from '@shared/schemas'
import { validate } from '@shared/validation'

interface Result<T> {
  success: boolean
  error?: string
  customers?: CustomerProfile[]
  customer?: T
  products?: ItemProfile[]
  product?: T
}

interface CustomerPayload extends Omit<CustomerDraft, 'email' | 'address' | 'discountId'> {
  email: string | null
  address: string | null
  discountId: string | null
}

const customerPayload = (customer: CustomerDraft): CustomerPayload => ({
  ...customer,
  email: customer.email || null,
  address: customer.address || null,
  discountId: customer.discountId || null
})

const mapCustomer = (customer: CustomerProfile): CustomerProfile => ({
  ...customer,
  email: customer.email ?? '',
  address: customer.address ?? '',
  discountId: customer.discountId ?? '',
  transactions: customer.transactions ?? []
})

const mapProduct = (
  product: ItemProfile & { isPrescribed?: boolean; isControlled?: boolean }
): ItemProfile => ({
  ...product,
  prescriptionRequired: product.isPrescribed ?? product.prescriptionRequired,
  controlled: product.isControlled ?? product.controlled,
  genericEquivalentIds: [],
  batches: product.batches.map((batch) => ({ ...batch, expiresAt: String(batch.expiresAt) }))
})

export async function getCustomers(): Promise<CustomerProfile[]> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.customer.getAll
  )) as Result<never>
  if (!result.success) throw new Error(result.error ?? 'Unable to load customers.')
  return (result.customers ?? []).map(mapCustomer)
}

export async function saveCustomer(customer: CustomerDraft, id?: number): Promise<CustomerProfile> {
  const channel = id ? channels.customer.updateOneById : channels.customer.createOne
  const payload = validate(id ? customerUpdateSchema : newCustomerSchema, customerPayload(customer))
  const args = id ? [id, payload] : [payload]
  const result = (await window.electron.ipcRenderer.invoke(
    channel,
    ...args
  )) as Result<CustomerProfile>
  if (!result.success || !result.customer) {
    throw new Error(result.error ?? 'Unable to save the customer.')
  }
  return mapCustomer(result.customer)
}

export async function removeCustomer(id: number): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.customer.removeOneById,
    id
  )) as Result<never>
  if (!result.success) throw new Error(result.error ?? 'Unable to remove the customer.')
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

export async function removeProduct(id: number): Promise<void> {
  const result = (await window.electron.ipcRenderer.invoke(
    channels.product.removeOneById,
    id
  )) as Result<never>
  if (!result.success) throw new Error(result.error ?? 'Unable to remove the product.')
}
