import { filterInput, type InputRule } from '@shared/inputRules'
import type { ComponentProps, ReactElement } from 'react'
import { useFormContext } from 'react-hook-form'

type TextProps = ComponentProps<'input'> & {
  name: string
  /** Blocks characters the field does not accept while typing. */
  rule?: InputRule
}

export default function Text({ name, className, rule, ...props }: TextProps): ReactElement {
  const { register } = useFormContext()
  const registration = register(name)

  return (
    <input
      {...registration}
      {...props}
      onChange={(event) => {
        if (rule) event.target.value = filterInput(rule, event.target.value).value
        return registration.onChange(event)
      }}
      className={['field', className].filter(Boolean).join(' ')}
    />
  )
}
