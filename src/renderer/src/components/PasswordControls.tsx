import {
  type ButtonHTMLAttributes,
  createContext,
  type InputHTMLAttributes,
  type PropsWithChildren,
  ReactNode,
  useContext,
  useState
} from 'react'

interface PasswordControlsContext {
  show: boolean
  toggle: VoidFunction
}

export const PasswordControlsContext = createContext<PasswordControlsContext | null>(null)

export function usePasswordControls() {
  const context = useContext(PasswordControlsContext)

  if (context === null) {
    throw new Error(
      `${usePasswordControls.name} must be used within a <${PasswordControlsProvider.name}>`
    )
  }

  return context
}

export function PasswordControlsProvider({ children }: PropsWithChildren) {
  const [show, setShow] = useState(false)

  return (
    <PasswordControlsContext
      value={{
        show,
        toggle: () => setShow((value) => !value)
      }}
    >
      {children}
    </PasswordControlsContext>
  )
}

export function PasswordInput(attributes: InputHTMLAttributes<HTMLInputElement>) {
  const { show } = usePasswordControls()

  return <input {...attributes} type={show ? 'text' : 'password'} />
}

export function PasswordToggle({
  showIcon,
  hideIcon,
  ...attributes
}: { showIcon: ReactNode; hideIcon: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { show, toggle } = usePasswordControls()

  return (
    <button type="button" {...attributes} onClick={toggle}>
      {show ? hideIcon : showIcon}
    </button>
  )
}
