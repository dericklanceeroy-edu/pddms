import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'
import InfoTip from './InfoTip'

/**
 * Labelled form control with a consistent required marker, hint, and inline error.
 *
 * Note: `hint` is for short text worth seeing at a glance (a format such as "4 digits", or a live
 * value such as an order total). Longer explanations go in `info`, behind an "i" button beside the
 * label, so forms are not crowded with text.
 */
export default function FormField({
  label,
  required = false,
  showOptional = true,
  hint,
  info,
  error,
  children,
  className = ''
}: {
  label: string
  required?: boolean
  /** Hide the "(optional)" marker, e.g. for read-only values. */
  showOptional?: boolean
  hint?: string
  /** Longer explanation, shown from an "i" button beside the label. */
  info?: ReactNode
  error?: string
  children: ReactElement
  className?: string
}): ReactElement {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')
  return (
    <div className={`min-w-0 text-sm ${className}`}>
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="field-label">
          {label}
          {required ? (
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          ) : (
            showOptional && (
              <span className="ml-1 text-xs font-normal text-slate-600">(optional)</span>
            )
          )}
        </label>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </div>
      <div className="mt-1.5">
        {cloneElement(children as ReactElement<Record<string, unknown>>, {
          id,
          'aria-required': required || undefined,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy || undefined
        })}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-slate-500">
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
      className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
    >
      {message}
    </p>
  )
}

export function RequiredNote(): ReactElement {
  return (
    <p className="text-xs text-slate-500">
      Fields marked <span className="required-mark">*</span> are required.
    </p>
  )
}
