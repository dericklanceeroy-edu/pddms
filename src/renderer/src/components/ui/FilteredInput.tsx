import { filterInput, inputRules, type InputRule } from '@shared/inputRules'
import { useEffect, useState, type InputHTMLAttributes, type ReactElement } from 'react'

/**
 * Text input that blocks characters a field does not accept while the user types or pastes,
 * and says which characters were left out (in orange, as a warning, beside the field).
 */
export default function FilteredInput({
  rule,
  value,
  onValueChange,
  className = 'field',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  rule: InputRule
  value: string
  onValueChange: (value: string) => void
}): ReactElement {
  const [blocked, setBlocked] = useState<string[]>([])
  useEffect(() => {
    if (!blocked.length) return
    const timer = window.setTimeout(() => setBlocked([]), 4000)
    return () => window.clearTimeout(timer)
  }, [blocked])
  return (
    <>
      <input
        {...props}
        className={className}
        value={value}
        onChange={(event) => {
          const result = filterInput(rule, event.target.value)
          setBlocked(result.blocked)
          onValueChange(result.value)
        }}
      />
      {blocked.length > 0 && (
        <span role="status" className="mt-1 block text-xs font-medium text-amber-700">
          {blocked.map((character) => `“${character}”`).join(' ')} not allowed. Use only{' '}
          {inputRules[rule].description}.
        </span>
      )}
    </>
  )
}
