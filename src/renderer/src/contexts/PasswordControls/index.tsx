import {
  type ButtonHTMLAttributes,
  createContext,
  type InputHTMLAttributes,
  useContext
} from 'react'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'
import PasswordControlsProvider from './Provider'

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

export default PasswordControlsProvider

export function PasswordInput(attributes: InputHTMLAttributes<HTMLInputElement>) {
  const { show } = usePasswordControls()

  return <input {...attributes} type={show ? 'text' : 'password'} />
}

export function PasswordToggle(attributes: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { show, toggle } = usePasswordControls()

  return (
    <button {...attributes} onClick={toggle}>
      {show ? <BsEyeSlashFill /> : <BsEyeFill />}
    </button>
  )
}
