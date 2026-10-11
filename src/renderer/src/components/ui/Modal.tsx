import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'

/**
 * Shared in-app dialog.
 *
 * Note: Native `window.confirm`/`alert` can leave Electron inputs unable to take focus until the
 * window is re-activated (Alt+Tab). Dialogs are rendered in the page instead, move focus inside
 * when opened, close on Escape, and return focus to the control that opened them.
 */
export default function Modal({
  title,
  description,
  close,
  children,
  size = 'md',
  busy = false
}: {
  title: string
  description?: string
  close: VoidFunction
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Prevents closing while a save is in progress. */
  busy?: boolean
}): ReactElement {
  const panel = useRef<HTMLElement>(null)
  const closeRef = useRef(close)
  const busyRef = useRef(busy)
  useEffect(() => {
    closeRef.current = close
    busyRef.current = busy
  })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = panel.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button[data-autofocus]'
    )
    ;(first ?? panel.current)?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  const width = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
  }[size]
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/50 p-4">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={() => !busy && close()}
      />
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`app-dialog relative z-10 max-h-[calc(100dvh-2rem)] w-full ${width} min-w-0 overflow-x-hidden overflow-y-auto rounded-lg bg-white p-5 shadow-2xl outline-none sm:p-6`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight break-words text-slate-950">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="icon-button"
            aria-label="Close dialog"
          >
            <FiX />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body
  )
}
