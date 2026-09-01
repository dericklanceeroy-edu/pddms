import { type ComponentType, type ReactElement, type SVGProps } from 'react'

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
}): ReactElement {
  const Icon = visible ? hide : show

  return (
    <button
      type="button"
      aria-label={visible ? 'Hide password' : 'Show password'}
      onClick={toggle}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-500 transition hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-mauve-300 focus-visible:outline-none"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  )
}
