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
export const newAccountSchema = z.strictObject({
  role: z.enum(Object.values(roles)),
  fullName: z.string().trim().min(2, 'Full name must have at least two characters.'),
  username: z.string().min(usernameMin, `Username must have at least ${usernameMin} characters.`),
  password: z.string().min(passwordMin, `Password must have at least ${passwordMin} characters`)
}) satisfies z.ZodType<NewAccount>

export const accountUpdateSchema = z.strictObject({
  role: z.enum(Object.values(roles)).optional(),
  fullName: z.string().trim().min(2).optional(),
  username: z.string().min(4).optional(),
  password: z.string().min(8).optional()
}) satisfies z.ZodType<AccountUpdate>

export const credentialsSchema = z.strictObject({
  username: z.string(),
  password: z.string()
}) satisfies z.ZodType<Credentials>

export const masterSetupSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(2, 'Full name must have at least two characters.')
})

const customerFields = {
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  email: z.string().trim().email().nullable(),
  address: z.string().trim().nullable(),
  discountType: z.enum(['none', 'senior', 'pwd']),
  discountId: z.string().trim().nullable(),
  discountExpiresAt: z.string().nullable()
}

export const newCustomerSchema = z.strictObject(customerFields) satisfies z.ZodType<NewCustomer>
export const customerUpdateSchema = z.strictObject(
  customerFields
) satisfies z.ZodType<CustomerUpdate>

export const newDrugSchema = z.strictObject({
  category: z.string().trim().min(1),
  genericName: z.string().trim().min(1),
  brandName: z.string().trim().min(1),
  formulation: z.string().trim().min(1),
  isPrescribed: z.boolean(),
  isControlled: z.boolean(),
  reorderLevel: z.number().int().nonnegative()
}) satisfies z.ZodType<NewProduct>

export const productUpdateSchema = newDrugSchema.partial() satisfies z.ZodType<ProductUpdate>

const supplierFields = {
  organization: z.string().trim().min(2),
  person: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  telephone: z.string().trim().nullable(),
  email: z.string().trim().email().nullable(),
  street: z.string().trim().min(1),
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
  province: z.string().trim().min(1),
  postalCode: z.string().trim().min(1)
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
