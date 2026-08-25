import { type ComponentType, type SVGProps } from 'react'

export type Icon = ComponentType<SVGProps<SVGSVGElement>>

export default function VisibilityToggle({
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

  // To-do: Text color must match the chosen theme color instead of
  // a hardcoded value.
  const textColor = 'text-neutral-500'

  return <Icon onClick={toggle} className={`pointer-events-auto cursor-pointer ${textColor}`} />
}
