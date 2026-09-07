import z from 'zod'
import { roles } from './constants'
import type {
  Account,
  AccountUpdate,
  Credentials,
  CustomerUpdate,
  NewAccount,
  NewCustomer,
  NewProduct,
  NewSupplier,
  ProductUpdate
} from './types'

export const accountSchema = z.strictObject({
  id: z.number().positive(),
  role: z.enum(Object.values(roles)),
  username: z.string().min(4),
  fullName: z.string().min(2),
  password: z.string().min(8),
  isArchived: z.union([z.literal(0), z.literal(1)]),
  isVerified: z.union([z.literal(0), z.literal(1)]),
  createdAt: z.date(),
  updatedAt: z.date()
}) satisfies z.ZodType<Account>

const usernameMin = 4
const passwordMin = 8
const namePattern = /^\p{L}[\p{L} .,'-]*$/u
const usernamePattern = /^[A-Za-z0-9._-]+$/
const phonePattern = /^09\d{9}$/
const catalogTextPattern = /^[\p{L}0-9][\p{L}0-9 .,&()/'-]*$/u

export const newAccountSchema = z.strictObject({
  role: z.enum(Object.values(roles)),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must have at least two characters.')
    .regex(namePattern),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(usernameMin, 'Username must have at least 4 characters.')
    .max(32)
    .regex(usernamePattern),
  password: z.string().min(passwordMin, 'Password must have at least 8 characters.')
}) satisfies z.ZodType<NewAccount>

export const accountUpdateSchema = z.strictObject({
  role: z.enum(Object.values(roles)).optional(),
  fullName: z.string().trim().min(2).regex(namePattern).optional(),
  username: z.string().trim().toLowerCase().min(4).max(32).regex(usernamePattern).optional(),
  password: z.string().min(8).optional()
}) satisfies z.ZodType<AccountUpdate>

export const credentialsSchema = z.strictObject({
  username: z.string().trim().toLowerCase().min(usernameMin).max(32).regex(usernamePattern),
  password: z.string().min(passwordMin)
}) satisfies z.ZodType<Credentials>

export const masterSetupSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(2, 'Full name must have at least two characters.')
})

const customerFields = {
  fullName: z.string().trim().min(2).regex(namePattern),
  phone: z.string().trim().regex(phonePattern),
  email: z.string().trim().email().nullable(),
  address: z.string().trim().nullable(),
  discountType: z.enum(['none', 'senior', 'pwd']),
  discountId: z.string().trim().nullable(),
  discountExpiresAt: z.string().nullable()
}

const customerSchema = z.strictObject(customerFields).superRefine((value, context) => {
  if (value.discountType !== 'none' && !value.discountId) {
    context.addIssue({ code: 'custom', path: ['discountId'], message: 'Discount ID is required.' })
  }
})

export const newCustomerSchema = customerSchema satisfies z.ZodType<NewCustomer>
export const customerUpdateSchema = customerSchema satisfies z.ZodType<CustomerUpdate>

export const newDrugSchema = z.strictObject({
  category: z.string().trim().min(1).regex(catalogTextPattern),
  genericName: z.string().trim().min(1).regex(catalogTextPattern),
  brandName: z.string().trim().min(1).regex(catalogTextPattern),
  formulation: z.string().trim().min(1).regex(catalogTextPattern),
  isPrescribed: z.boolean(),
  isControlled: z.boolean(),
  reorderLevel: z.number().int().nonnegative()
}) satisfies z.ZodType<NewProduct>

export const productUpdateSchema = newDrugSchema.partial() satisfies z.ZodType<ProductUpdate>

const supplierFields = {
  organization: z.string().trim().min(2),
  person: z.string().trim().min(2).regex(namePattern),
  phone: z.string().trim().regex(phonePattern),
  telephone: z.string().trim().nullable(),
  email: z.string().trim().email().nullable(),
  street: z.string().trim().min(1),
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
  province: z.string().trim().min(1),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
}

const supplierSchema = z.strictObject(supplierFields)
export const newSupplierSchema = supplierSchema satisfies z.ZodType<NewSupplier>
export const supplierUpdateSchema = supplierSchema.partial()

export const purchaseOrderStatusSchema = z.enum([
  'draft',
  'submitted',
  'partially_received',
  'received',
  'cancelled'
])

export const newPurchaseOrderSchema = z.strictObject({
  supplierId: z.number().int().positive(),
  expectedAt: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  items: z
    .array(
      z.strictObject({
        drugId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        unitCost: z.number().nonnegative()
      })
    )
    .min(1)
})

export const purchaseOrderStatusUpdateSchema = z.strictObject({
  status: purchaseOrderStatusSchema
})

export const purchaseOrderDeliverySchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        itemId: z.number().int().positive(),
        receivedQuantity: z.number().int().nonnegative()
      })
    )
    .min(1)
})
