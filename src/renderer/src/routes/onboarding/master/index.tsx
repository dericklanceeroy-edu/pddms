import { zodResolver } from '@hookform/resolvers/zod'
import TypedForm from '@renderer/components/TypedForm'
import { newAccountSchema } from '@shared/schemas'
import type { NewAccount } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, HelperText, Label, TextInput, type TextInputProps } from 'flowbite-react'
import { type ComponentType, type SVGProps, useState } from 'react'
import { useForm } from 'react-hook-form'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'

export const Route = createFileRoute('/onboarding/master/')({
  component: RouteComponent
})

type Icon = ComponentType<SVGProps<SVGSVGElement>>

function PasswordIcon({
  visible,
  show,
  hide,
  toggle
}: {
  visible: boolean
  show: Icon
  hide: Icon
  toggle: VoidFunction
}) {
  const Icon = visible ? hide : show

  return <Icon onClick={toggle} className="pointer-events-auto cursor-pointer text-neutral-500" />
}

// Note: Is there a Flowbite native way of doing this?
function PasswordInput({
  show = BsEyeFill,
  hide = BsEyeSlashFill,
  ...props
}: TextInputProps & {
  show?: Icon
  hide?: Icon
}) {
  const [visible, setVisible] = useState(false)

  return (
    <TextInput
      {...props}
      type={visible ? 'text' : 'password'}
      rightIcon={() => (
        <PasswordIcon
          visible={visible}
          toggle={() => setVisible((old) => !old)}
          show={show}
          hide={hide}
        />
      )}
    />
  )
}

function MasterForm() {
  const navigate = useNavigate()
  const {
    handleSubmit,
    register,
    formState: { errors }
  } = useForm<NewAccount>({
    defaultValues: {
      role: 'master',
      username: '',
      password: ''
    },
    resolver: zodResolver(newAccountSchema)
  })

  return (
    <TypedForm
      className="flex flex-col gap-2 [&>div>*:nth-child(2)]:mt-2"
      onSubmit={handleSubmit(() => {
        navigate({ to: '/onboarding/completion' })
      })}
    >
      <div>
        <Label htmlFor="username" color={errors.username ? 'failure' : 'primary'}>
          Username
        </Label>
        <TextInput
          {...register('username')}
          id="username"
          type="text"
          color={errors.username ? 'failure' : 'primary'}
          placeholder="Enter username"
        />
        {errors.username && <HelperText>{errors.username.message}</HelperText>}
      </div>
      <div>
        <Label htmlFor="password" color={errors.password ? 'failure' : 'primary'}>
          Password
        </Label>
        <PasswordInput
          {...register('password')}
          id="password"
          color={errors.password ? 'failure' : 'primary'}
          placeholder="Enter password"
        />
        {errors.password && <HelperText>{errors.password.message}</HelperText>}
      </div>
      <Button type="submit" color="primary" className="mt-4">
        Continue
      </Button>
    </TypedForm>
  )
}

function RouteComponent() {
  return (
    <div className="w-[20rem] space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Setup master account</h1>
        <p className="text-neutral-500">You can edit this at the settings.</p>
      </div>
      <MasterForm />
    </div>
  )
}
