import type { ComponentProps, ReactElement } from 'react'
import { useFormContext } from 'react-hook-form'

type TextProps = ComponentProps<'input'> & {
  name: string
}

export default function Text({ name, className, ...props }: TextProps): ReactElement {
  const { register } = useFormContext()

  return (
    <input
      {...register(name)}
      {...props}
      className={['field', className].filter(Boolean).join(' ')}
    />
  )
}
