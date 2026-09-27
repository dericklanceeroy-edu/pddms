import z from 'zod'

const fieldLabels: Record<string, string> = {
  phone: 'Invalid phone number.',
  email: 'Invalid email address.',
  username: 'Invalid username.',
  fullName: 'Invalid full name.',
  discountId: 'Invalid discount ID.',
  category: 'Invalid category.',
  genericName: 'Invalid generic name.',
  brandName: 'Invalid brand name.',
  formulation: 'Invalid formulation.',
  reorderLevel: 'Reorder level must be a whole number of 0 or greater.',
  organization: 'Invalid organization name.',
  person: 'Invalid contact person.',
  postalCode: 'Invalid postal code.',
  supplierId: 'This field is required.',
  drugId: 'This field is required.',
  quantity: 'Quantity must be a whole number greater than 0.',
  unitCost: 'Unit cost must be 0 or greater.',
  receivedQuantity: 'Delivered quantity is invalid.'
}

export function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0]
    const field = String(issue?.path.findLast((part) => typeof part === 'string') ?? '')
    const input = (issue as { input?: unknown } | undefined)?.input
    if (issue?.code === 'custom') return issue.message

    if (
      [
        'category',
        'genericName',
        'brandName',
        'formulation',
        'reorderLevel',
        'quantity',
        'batchId'
      ].includes(field)
    ) {
      return fieldLabels[field] ?? 'Select an inventory batch.'
    }

    if (
      issue &&
      ((issue.code === 'invalid_type' && input === undefined) ||
        (typeof input === 'string' && input.trim() === ''))
    ) {
      return 'This field is required.'
    }

    return fieldLabels[field] ?? issue?.message ?? 'Invalid input.'
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
  if (!result.success) throw new Error(formatValidationError(result.error))
  return result.data
}
