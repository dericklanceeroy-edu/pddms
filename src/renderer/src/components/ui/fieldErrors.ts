import { FieldValidationError } from '@shared/validation'

export type FieldErrors = Record<string, string>

/**
 * Splits a failed save into inline field errors and a form-level message.
 *
 * `paths` maps schema paths (e.g. `items.0.batchNumber`) to form keys; unmatched issues fall back
 * to the form-level message so nothing is silently hidden.
 */
export function splitErrors(
  cause: unknown,
  fallback: string,
  mapPath: (path: string, field: string) => string | null = (_path, field) => field || null
): { fields: FieldErrors; form: string } {
  if (cause instanceof FieldValidationError) {
    const fields: FieldErrors = {}
    const unmatched: string[] = []
    for (const issue of cause.issues) {
      const key = mapPath(issue.path, issue.field)
      if (key) fields[key] ??= issue.message
      else unmatched.push(issue.message)
    }
    return {
      fields,
      form:
        unmatched[0] ?? (Object.keys(fields).length ? 'Check the highlighted fields.' : fallback)
    }
  }
  return { fields: {}, form: cause instanceof Error ? cause.message : fallback }
}
