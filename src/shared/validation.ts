import z from 'zod'

/**
 * Human-readable names for form fields, used to turn schema issues into actionable messages.
 */
export const fieldNames: Record<string, string> = {
  phone: 'Mobile phone',
  telephone: 'Telephone',
  email: 'Email',
  username: 'Username',
  fullName: 'Full name',
  password: 'Password',
  discountId: 'Discount ID',
  category: 'Category',
  genericName: 'Generic name',
  brandName: 'Brand name',
  formulation: 'Formulation',
  reorderLevel: 'Reorder level',
  organization: 'Organization',
  person: 'Contact person',
  street: 'Street',
  city: 'City',
  province: 'Province',
  country: 'Country',
  postalCode: 'Postal code',
  supplierId: 'Supplier',
  drugId: 'Product',
  quantity: 'Quantity',
  unitCost: 'Unit cost',
  expectedAt: 'Expected delivery date',
  notes: 'Notes',
  items: 'Order lines',
  receivedQuantity: 'Delivered quantity',
  batchNumber: 'Batch number',
  sellPrice: 'Selling price',
  expiresAt: 'Expiry date',
  deliveredAt: 'Delivery date',
  purchaseOrderId: 'Purchase order',
  invoiceId: 'Supplier invoice',
  invoiceNumber: 'Invoice number',
  invoiceDate: 'Invoice date',
  dueDate: 'Payment due date',
  amount: 'Amount',
  paidAt: 'Payment date',
  method: 'Payment method',
  referenceNumber: 'Reference number',
  fileToken: 'Invoice file',
  batchId: 'Inventory batch',
  reason: 'Reason'
}

// Note: Field-specific wording for format rules a generic message cannot explain.
const formatMessages: Record<string, string> = {
  phone: 'Mobile phone must be 11 digits starting with 09, e.g. 09171234567.',
  email: 'Email must be a valid address, e.g. name@example.com.',
  username: 'Username may use only letters, numbers, dots, dashes or underscores.',
  fullName: 'Full name may use only letters, spaces, periods, commas, apostrophes or hyphens.',
  person: 'Contact person may use only letters, spaces, periods, commas, apostrophes or hyphens.',
  postalCode: 'Postal code must be 4 digits, e.g. 8000.',
  category: 'Category must start with a letter or number and avoid special symbols.',
  genericName: 'Generic name must start with a letter or number and avoid special symbols.',
  brandName: 'Brand name must start with a letter or number and avoid special symbols.',
  formulation: 'Formulation must start with a letter or number and avoid special symbols.',
  batchNumber: 'Batch number may use only letters, numbers, spaces and - / . # _ ( ).',
  invoiceNumber: 'Invoice number may use only letters, numbers, spaces and - / . # _ ( ).',
  referenceNumber: 'Reference number may use only letters, numbers, spaces and - / . # _ ( ).',
  fileToken: 'Invoice file is required. Choose the invoice document to attach.',
  requestId: 'The form expired. Close it and try again.'
}

const amountFields = new Set(['unitCost', 'sellPrice', 'amount'])
// Note: Record pickers send 0 when nothing is selected.
const selectionFields = new Set(['supplierId', 'drugId', 'purchaseOrderId', 'invoiceId', 'batchId'])
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

export interface ValidationIssue {
  /** Dotted path to the field, e.g. `items.0.batchNumber`. */
  path: string
  /** The last named field in the path, e.g. `batchNumber`. */
  field: string
  message: string
}

const issueField = (issue: z.core.$ZodIssue): string =>
  String(issue.path.findLast((part) => typeof part === 'string') ?? '')

/**
 * Converts one schema issue into a message staff can act on without technical wording.
 */
export function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === 'custom') return issue.message
  const field = issueField(issue)
  const name = fieldNames[field] ?? 'This field'
  const isAmount = amountFields.has(field)
  const received = (issue as { received?: string }).received ?? issue.message.split(' ').at(-1)

  if (issue.code === 'invalid_type') {
    if (received === 'undefined' || received === 'null') return `${name} is required.`
    if (issue.expected === 'int') return `${name} must be a whole number.`
    if (issue.expected === 'number')
      return received === 'NaN'
        ? `Enter a number for ${name.toLowerCase()}.`
        : `${name} must be a finite number.`
    return `${name} is invalid.`
  }
  if (issue.code === 'too_small') {
    const minimum = Number(issue.minimum)
    if (issue.origin === 'string')
      return minimum <= 1
        ? `${name} is required.`
        : `${name} must have at least ${minimum} characters.`
    if (issue.origin === 'array') return `Add at least ${minimum} ${name.toLowerCase()}.`
    if (selectionFields.has(field)) return `Select a ${name.toLowerCase()}.`
    if (minimum === 0 && !issue.inclusive) return `${name} must be greater than 0.`
    return `${name} must be ${isAmount ? '₱' : ''}${number.format(minimum)} or more.`
  }
  if (issue.code === 'too_big') {
    const maximum = Number(issue.maximum)
    if (issue.origin === 'string') return `${name} must be ${maximum} characters or fewer.`
    return `${name} cannot exceed ${isAmount ? '₱' : ''}${number.format(maximum)}.`
  }
  if (issue.code === 'invalid_format' || issue.code === 'invalid_value')
    return formatMessages[field] ?? `${name} is invalid.`
  if (issue.code === 'unrecognized_keys')
    return 'The form sent unexpected data. Reload and try again.'
  return formatMessages[field] ?? `${name} is invalid.`
}

/**
 * Lists every schema issue with its field path, for showing errors beside the affected inputs.
 */
export function validationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    field: issueField(issue),
    message: describeIssue(issue)
  }))
}

/**
 * Error raised by renderer-side validation; carries every field issue for inline display.
 */
export class FieldValidationError extends Error {
  readonly issues: ValidationIssue[]

  constructor(issues: ValidationIssue[]) {
    super(issues[0]?.message ?? 'Check the highlighted fields.')
    this.name = 'FieldValidationError'
    this.issues = issues
  }
}

export function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0]
    return issue ? describeIssue(issue) : 'Invalid input.'
  }

  if (error instanceof Error) {
    const code = 'code' in error ? String(error.code) : ''
    if (code.startsWith('SQLITE_CONSTRAINT_FOREIGNKEY'))
      return 'This record is linked to existing transactions and cannot be removed.'
    if (code.startsWith('SQLITE_CONSTRAINT_UNIQUE')) return 'That record already exists.'
    if (code.startsWith('SQLITE_'))
      return 'Unable to save or load the record. Please reload and try again.'
    if (/^E[A-Z]+$/.test(code))
      return 'Unable to access the file. Check the file and folder permissions.'
    if (error.name === 'UnauthorizedError') return 'You do not have permission for this action.'
    return error.message
  }
  return 'Unable to complete the operation. Please try again.'
}

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new FieldValidationError(validationIssues(result.error))
  return result.data
}
