import { type PropsWithChildren, useState } from 'react'
import { PasswordControlsContext } from '.'

export default function PasswordControlsProvider({ children }: PropsWithChildren) {
  const [show, setShow] = useState(false)

  return (
    <PasswordControlsContext
      value={{
        show,
        toggle: () => {
          setShow((value) => !value)
        }
      }}
    >
      {children}
    </PasswordControlsContext>
  )
}
