import type { ComponentProps, ReactElement } from 'react'
import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import VisibilityToggle, { type Icon } from './VisibilityToggle'

/**
 * A native password input with a visibility toggle.
 */
export default function Password({
  show,
  hide,
  name,
  className,
  ...props
}: ComponentProps<'input'> & {
  name: string
  show: Icon
  hide: Icon
}): ReactElement {
  const { register } = useFormContext()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        {...register(name)}
        {...props}
        type={visible ? 'text' : 'password'}
        className={['field', 'pr-11', className].filter(Boolean).join(' ')}
      />
      <VisibilityToggle
        visible={visible}
        show={show}
        hide={hide}
        toggle={() => setVisible((old) => !old)}
      />
    </div>
  )
}
