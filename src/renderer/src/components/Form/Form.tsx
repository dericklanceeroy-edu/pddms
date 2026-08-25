import { type ComponentProps, type PropsWithChildren } from 'react'
import { type FieldValues, FormProvider, useForm } from 'react-hook-form'
import type { Merge } from 'type-fest'
import TypedForm from '../TypedForm'
import Password from './components/Password/Password'
import Submit from './components/Submit'
import Text from './components/Text'

export default function Form<T extends FieldValues>({
  children,
  onSubmit,
  ...props
}: PropsWithChildren<Merge<ComponentProps<typeof TypedForm>, { onSubmit: (data: T) => void }>>) {
  const methods = useForm<T>()

  return (
    <FormProvider {...methods}>
      <TypedForm onSubmit={methods.handleSubmit(onSubmit)} {...props}>
        {children}
      </TypedForm>
    </FormProvider>
  )
}

Form.Text = Text
Form.Password = Password
Form.Submit = Submit
