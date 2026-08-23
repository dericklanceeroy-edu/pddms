import { createContext, useContext } from 'react'
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
