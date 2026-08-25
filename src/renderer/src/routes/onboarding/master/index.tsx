import { createFileRoute } from '@tanstack/react-router'
import { Button, TextInput, TextInputProps } from 'flowbite-react'
import { type ComponentType, type SVGProps, useState } from 'react'
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

/**
 * @note Is there a Flowbite native way of doing this?
 */
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

function RouteComponent() {
  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Setup master account</h1>
        <p className="text-neutral-500">You can edit this at the settings.</p>
      </div>
      <form className="flex flex-col gap-4">
        <TextInput type="text" color="primary" placeholder="Username" required />
        <PasswordInput color="primary" placeholder="Password" required />
        <Button color="primary" type="submit">
          Continue
        </Button>
      </form>
    </div>
  )
}
