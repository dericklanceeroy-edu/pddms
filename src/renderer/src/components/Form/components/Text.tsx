import { TextInput, type TextInputProps } from 'flowbite-react'
import { useFormContext } from 'react-hook-form'
import { SetRequired } from 'type-fest'

export default function Text({ name, ...props }: SetRequired<TextInputProps, 'name'>) {
  const { register } = useFormContext()

  return <TextInput {...register(name)} {...props} />
}
