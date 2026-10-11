import { cloneElement, useId, type ReactElement } from 'react'

/**
 * Labelled form control with a consistent required marker, hint, and inline error.
 */
export default function FormField({
  label,
  required = false,
  hint,
  error,
  children,
  className = ''
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactElement
  className?: string
}): ReactElement {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')
  return (
    <div className={`min-w-0 text-sm ${className}`}>
      <label htmlFor={id} className="block font-medium text-neutral-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-rose-600" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1 text-xs font-normal text-neutral-400">(optional)</span>
        )}
      </label>
      <div className="mt-1.5">
        {cloneElement(children as ReactElement<Record<string, unknown>>, {
          id,
          'aria-required': required || undefined,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy || undefined
        })}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Form-level error summary shown above the actions.
 */
export function FormError({ message }: { message: string }): ReactElement | null {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
    >
      {message}
    </p>
  )
}

export function RequiredNote(): ReactElement {
  return (
    <p className="text-xs text-neutral-500">
      Fields marked <span className="text-rose-600">*</span> are required.
    </p>
  )
}
