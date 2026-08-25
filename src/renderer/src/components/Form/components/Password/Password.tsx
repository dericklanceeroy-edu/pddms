import { TextInput, type TextInputProps } from 'flowbite-react'
import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import type { SetRequired } from 'type-fest'
import VisibilityToggle, { type Icon } from './VisibilityToggle'

/**
 * A Flowbite `<TextInput>` but for passwords and includes visibility toggle.
 */
// Note: Is there a Flowbite native way of doing this?
export default function Password({
  show,
  hide,
  name,
  ...props
}: SetRequired<TextInputProps, 'name'> & {
  show: Icon
  hide: Icon
}) {
  const { register } = useFormContext()
  const [visible, setVisible] = useState(false)

  return (
    <TextInput
      type={visible ? 'text' : 'password'}
      rightIcon={() => (
        <VisibilityToggle
          visible={visible}
          show={show}
          hide={hide}
          toggle={() => setVisible((old) => !old)}
        />
      )}
      {...register(name)}
      {...props}
    />
  )
}
