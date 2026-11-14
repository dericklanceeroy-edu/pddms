import z from 'zod'
import { roles } from './constants'
import { localDate } from './inventory'
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
import { boxOnlyUnitSchema, piecesPerBoxSchema } from './units'

export const accountSchema = z.strictObject({
  failedAttempts: z.number().int().nonnegative(),
  lastFailedAt: z.string().nullable(),
  lockedUntil: z.string().nullable(),
  id: z.number().positive(),
  role: z.enum(Object.values(roles)),
  username: z.string().min(4),
  fullName: z.string().min(2),
  email: z.string().nullable(),
  password: z.string().min(8),
  isArchived: z.union([z.literal(0), z.literal(1)]),
  isVerified: z.union([z.literal(0), z.literal(1)]),
  createdAt: z.date(),
  updatedAt: z.date()
}) satisfies z.ZodType<Account>

const usernameMin = 4
const namePattern = /^\p{L}[\p{L} .,'-]*$/u
const usernamePattern = /^[A-Za-z0-9._-]+$/
const phonePattern = /^09\d{9}$/
// Note: Drug names and formulations use strengths such as "0.5%", "B1+B6" and "1:1".
const catalogTextPattern = /^[\p{L}0-9][\p{L}0-9 .,&()/'%+:-]*$/u
// Note: Landline numbers vary by area; allow digits with common separators only.
const telephonePattern = /^\+?[0-9(][0-9 ()-]{5,18}[0-9]$/
// Note: Senior Citizen (OSCA) and PWD ID numbers are issued by each LGU in different formats.
// Only letters and numbers are kept; spaces, dashes, slashes and dots printed on some IDs are
// removed before saving, so older IDs saved with them still pass.
export const discountIdPattern = /^[A-Za-z0-9]+$/
export const normalizeDiscountId = (value: string): string => value.replace(/[\s./-]/g, '')
const NAME_MAX = 120
const ADDRESS_MAX = 500
const PLACE_MAX = 100
const PASSWORD_MAX = 128
const EMAIL_MAX = 254

/** Payment methods offered for supplier payments and wholesale receivables. */
export const paymentMethods = ['Cash', 'Bank transfer', 'Check', 'E-wallet', 'Other'] as const
export const paymentMethodSchema = z.enum(paymentMethods, {
  error: 'Select a payment method from the list.'
})
const accountEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .max(EMAIL_MAX, `Email must be ${EMAIL_MAX} characters or fewer.`)
  .email('Email must be a valid address, e.g. name@example.com.')

/**
 * Accepts the usual ways of writing a Philippine mobile number and stores the 09XXXXXXXXX form:
 * spaces, dashes, dots and brackets are removed and a +63 / 63 prefix becomes 0.
 */
export function normalizeMobile(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, '')
  if (/^\+?639\d{9}$/.test(compact)) return `0${compact.replace(/^\+?63/, '')}`
  return compact
}

const mobileSchema = z.string().transform(normalizeMobile).pipe(z.string().regex(phonePattern))
// Note: A password must contain something besides spaces; the cap keeps hashing input bounded.
const newPasswordSchema = z
  .string()
  .min(8, 'Password must have at least 8 characters.')
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer.`)
  .refine((value) => value.trim().length > 0, 'Password cannot be only spaces.')
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
// Note: No reference format is specified by the business; allow common document characters only.
const referencePattern = /^[A-Za-z0-9][A-Za-z0-9 ./#_()-]*$/
const referenceText = (max: number): z.ZodString =>
  z.string().trim().min(1).max(max).regex(referencePattern)
// Note: Whole-unit quantities stored as SQLite integers; the bound only prevents unsafe totals.
const MAX_LINE_QUANTITY = 1_000_000_000
export const MAX_REORDER_LEVEL = 1_000_000

const isCalendarDate = (value: string): boolean => {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

export const isoDateSchema = (message: string): z.ZodType<string> =>
  z.string().regex(isoDatePattern, message).refine(isCalendarDate, message)

// Note: Upper bound keeps peso amounts well inside exact floating-point cents.
export const MAX_CURRENCY_AMOUNT = 10_000_000
const currencyAmount = z
  .number()
  .nonnegative()
  .max(MAX_CURRENCY_AMOUNT)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    'Use an amount with at most two decimal places.'
  )

export const newAccountSchema = z.strictObject({
  role: z.enum(Object.values(roles)),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must have at least two characters.')
    .max(NAME_MAX)
    .regex(namePattern),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(usernameMin, 'Username must have at least 4 characters.')
    .max(32)
    .regex(usernamePattern),
  email: accountEmail,
  password: newPasswordSchema
}) satisfies z.ZodType<NewAccount>

export const accountUpdateSchema = z.strictObject({
  role: z.enum(Object.values(roles)).optional(),
  fullName: z.string().trim().min(2).max(NAME_MAX).regex(namePattern).optional(),
  username: z.string().trim().toLowerCase().min(4).max(32).regex(usernamePattern).optional(),
  email: accountEmail.optional(),
  password: newPasswordSchema.optional()
}) satisfies z.ZodType<AccountUpdate>

export const credentialsSchema = z.strictObject({
  username: z.string().trim().toLowerCase().min(usernameMin).max(32).regex(usernamePattern),
  password: z.string().min(1)
}) satisfies z.ZodType<Credentials>

export const profileUpdateSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(NAME_MAX).regex(namePattern),
  username: z.string().trim().toLowerCase().min(4).max(32).regex(usernamePattern),
  currentPassword: z.string().min(1).max(256),
  password: newPasswordSchema.optional()
})

export const masterSetupSchema = credentialsSchema.extend({
  password: newAccountSchema.shape.password,
  fullName: newAccountSchema.shape.fullName,
  email: accountEmail
})

export const clientTypes = ['retail', 'pharmacy'] as const
export type ClientType = (typeof clientTypes)[number]

const customerFields = {
  // Note: Retail customers buy at the counter; pharmacy clients are other pharmacies that place
  // wholesale orders. Both share contact details, so they live in the same table.
  clientType: z.enum(clientTypes).default('retail'),
  fullName: z.string().trim().min(2).max(NAME_MAX),
  contactPerson: z.string().trim().max(NAME_MAX).nullable().default(null),
  phone: mobileSchema,
  email: z.string().trim().max(EMAIL_MAX).email().nullable(),
  address: z.string().trim().max(ADDRESS_MAX).nullable(),
  discountType: z.enum(['none', 'senior', 'pwd']),
  discountId: z.string().trim().max(40).transform(normalizeDiscountId).nullable(),
  discountExpiresAt: isoDateSchema('Enter a valid discount expiry date.').nullable()
}

const customerSchema = z.strictObject(customerFields).superRefine((value, context) => {
  const pharmacy = value.clientType === 'pharmacy'
  if (!(pharmacy ? catalogTextPattern : namePattern).test(value.fullName))
    context.addIssue({
      code: 'custom',
      path: ['fullName'],
      message: pharmacy
        ? "Pharmacy name may use only letters, numbers, spaces and . , & ( ) / ' % + : -"
        : 'Full name may use only letters, spaces, periods, commas, apostrophes or hyphens.'
    })
  if (value.contactPerson && !namePattern.test(value.contactPerson))
    context.addIssue({
      code: 'custom',
      path: ['contactPerson'],
      message:
        'Contact person may use only letters, spaces, periods, commas, apostrophes or hyphens.'
    })
  if (pharmacy && value.discountType !== 'none')
    context.addIssue({
      code: 'custom',
      path: ['discountType'],
      message: 'Senior Citizen and PWD discounts apply to retail customers only.'
    })
  if (value.discountType === 'none') return
  const discountId = value.discountId ?? ''
  if (!discountId) {
    context.addIssue({ code: 'custom', path: ['discountId'], message: 'Discount ID is required.' })
  } else if (discountId.length < 4 || !discountIdPattern.test(discountId)) {
    context.addIssue({
      code: 'custom',
      path: ['discountId'],
      message:
        'Discount ID must be at least 4 characters and use only letters and numbers, as printed on the ID.'
    })
  }
  // Note: PWD IDs carry a validity date; Senior Citizen IDs are usually issued without one.
  if (value.discountType === 'pwd' && !value.discountExpiresAt) {
    context.addIssue({
      code: 'custom',
      path: ['discountExpiresAt'],
      message: 'Enter the PWD ID expiry date printed on the ID.'
    })
  }
  if (value.discountExpiresAt && value.discountExpiresAt < localDate()) {
    context.addIssue({
      code: 'custom',
      path: ['discountExpiresAt'],
      message: 'This discount ID has expired. Enter the renewed ID, or set eligibility to Regular.'
    })
  }
})

export const newCustomerSchema = customerSchema satisfies z.ZodType<NewCustomer>
export const customerUpdateSchema = customerSchema satisfies z.ZodType<CustomerUpdate>

export const newDrugSchema = z.strictObject({
  category: z.string().trim().min(1).max(NAME_MAX).regex(catalogTextPattern),
  genericName: z.string().trim().min(1).max(NAME_MAX).regex(catalogTextPattern),
  brandName: z.string().trim().min(1).max(NAME_MAX).regex(catalogTextPattern),
  formulation: z.string().trim().min(1).max(NAME_MAX).regex(catalogTextPattern),
  isPrescribed: z.boolean(),
  isControlled: z.boolean(),
  reorderLevel: z.number().int().nonnegative().max(MAX_REORDER_LEVEL),
  piecesPerBox: piecesPerBoxSchema.default(1)
}) satisfies z.ZodType<NewProduct>

export const productUpdateSchema = newDrugSchema.partial() satisfies z.ZodType<ProductUpdate>

export const stockOutSchema = z.strictObject({
  batchId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(3, 'Enter a stock-out reason (at least 3 characters).').max(500)
})

const supplierFields = {
  organization: z.string().trim().min(2).max(NAME_MAX).regex(catalogTextPattern),
  person: z.string().trim().min(2).max(NAME_MAX).regex(namePattern),
  phone: mobileSchema,
  telephone: z.string().trim().regex(telephonePattern).nullable(),
  email: z.string().trim().max(254).email().nullable(),
  street: z.string().trim().min(1).max(ADDRESS_MAX),
  city: z.string().trim().min(1).max(PLACE_MAX),
  country: z.string().trim().min(1).max(PLACE_MAX),
  province: z.string().trim().min(1).max(PLACE_MAX),
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

const purchaseOrderLineSchema = z.strictObject({
  drugId: z.number().int().positive(),
  quantity: z.number().int().positive().max(MAX_LINE_QUANTITY),
  unitCost: currencyAmount,
  // Note: Supplier orders are per box only; quantity and unit cost are per box and stock is
  // received in pieces. Lines saved before this rule keep their stored unit.
  unit: boxOnlyUnitSchema.default('box')
})

const purchaseOrderFields = {
  supplierId: z.number().int().positive(),
  expectedAt: isoDateSchema('Enter a valid expected delivery date.').nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  items: z.array(purchaseOrderLineSchema).min(1)
}

const checkOrderLines = (
  value: { items: Array<{ drugId: number; quantity: number; unitCost: number }> },
  context: z.RefinementCtx
): void => {
  const seen = new Set<number>()
  value.items.forEach((item, index) => {
    if (seen.has(item.drugId))
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'drugId'],
        message: 'This product is already on the order. Combine the quantities into one line.'
      })
    seen.add(item.drugId)
  })
  const total = value.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
  if (!Number.isSafeInteger(Math.round(total * 100)))
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'The order total is too large to store accurately. Split it into smaller orders.'
    })
}

export const newPurchaseOrderSchema = z
  .strictObject(purchaseOrderFields)
  .superRefine((value, context) => {
    checkOrderLines(value, context)
    if (value.expectedAt && value.expectedAt < localDate())
      context.addIssue({
        code: 'custom',
        path: ['expectedAt'],
        message: 'The expected delivery date cannot be before the order date (today).'
      })
  })

// Note: Only draft orders can be edited; the order-date rule is checked against the stored order.
export const purchaseOrderUpdateSchema = z
  .strictObject(purchaseOrderFields)
  .superRefine(checkOrderLines)

export const purchaseOrderStatusUpdateSchema = z.strictObject({
  status: purchaseOrderStatusSchema
})

const handlerName = (message: string): z.ZodString =>
  z.string().trim().min(2, message).max(120, 'Name is too long.').regex(namePattern, message)

export const purchaseOrderDeliverySchema = z
  .strictObject({
    requestId: z.string().uuid(),
    deliveredAt: isoDateSchema('Enter a valid delivery date.'),
    notes: z.string().trim().max(500).nullable().optional(),
    deliveredByName: handlerName("Enter the supplier's delivery person (letters only)."),
    checkedByName: handlerName('Enter who checked the delivery (letters only).'),
    items: z
      .array(
        z.strictObject({
          itemId: z.number().int().positive(),
          receivedQuantity: z.number().int().positive().max(MAX_LINE_QUANTITY),
          batchNumber: referenceText(80),
          sellPrice: currencyAmount.refine(
            (value) => value >= 0.01,
            'Selling price must be at least ₱0.01.'
          ),
          // Note: Optional box price; without one a box sells at piece price × pieces per box.
          boxSellPrice: currencyAmount
            .refine((value) => value >= 0.01, 'Box price must be at least ₱0.01.')
            .nullable()
            .optional(),
          expiresAt: isoDateSchema('Enter a valid expiry date.')
        })
      )
      .min(1)
  })
  .superRefine((value, context) => {
    if (value.deliveredAt > localDate())
      context.addIssue({
        code: 'custom',
        path: ['deliveredAt'],
        message: 'The delivery date cannot be in the future.'
      })
    value.items.forEach((item, index) => {
      if (item.expiresAt <= value.deliveredAt)
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'expiresAt'],
          message: 'The expiry date must be after the delivery date.'
        })
    })
  })

export const supplierInvoiceUploadSchema = z
  .strictObject({
    purchaseOrderId: z.number().int().positive(),
    invoiceNumber: referenceText(80),
    invoiceDate: isoDateSchema('Enter a valid invoice date.'),
    dueDate: isoDateSchema('Enter a valid due date.'),
    amount: currencyAmount.refine((value) => value >= 0.01, 'Amount must be at least ₱0.01.'),
    fileToken: z.string().uuid()
  })
  .refine((value) => value.invoiceDate <= localDate(), {
    path: ['invoiceDate'],
    message: 'The invoice date cannot be in the future.'
  })
  .refine((value) => value.dueDate >= value.invoiceDate, {
    path: ['dueDate'],
    message: 'The payment due date cannot be before the invoice date.'
  })

export const supplierPaymentSchema = z
  .strictObject({
    purchaseOrderId: z.number().int().positive(),
    invoiceId: z.number().int().positive().nullable().optional(),
    amount: currencyAmount.refine((value) => value >= 0.01, 'Amount must be at least ₱0.01.'),
    paidAt: isoDateSchema('Enter a valid payment date.'),
    method: paymentMethodSchema,
    referenceNumber: referenceText(120).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional()
  })
  .refine((value) => value.paidAt <= localDate(), {
    path: ['paidAt'],
    message: 'The payment date cannot be in the future.'
  })
