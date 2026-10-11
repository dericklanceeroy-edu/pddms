import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { FiAlertTriangle } from 'react-icons/fi'
import Modal from './Modal'

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Destructive actions use the danger style. */
  tone?: 'danger' | 'default'
}

/**
 * Promise-based replacement for `window.confirm` that renders an in-app dialog.
 */
export function useConfirm(): [ReactElement | null, (options: ConfirmOptions) => Promise<boolean>] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const ask = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const finish = (value: boolean): void => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const element = options ? (
    <Modal title={options.title} close={() => finish(false)} size="sm">
      <div className="flex gap-3">
        {options.tone === 'danger' && (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-700">
            <FiAlertTriangle aria-hidden="true" />
          </span>
        )}
        <div className="text-sm leading-6 text-slate-700">{options.message}</div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          className="secondary-button"
          onClick={() => finish(false)}
          data-autofocus
        >
          {options.cancelLabel ?? 'Go back'}
        </button>
        <button
          type="button"
          className={options.tone === 'danger' ? 'danger-button' : 'primary-button h-10'}
          onClick={() => finish(true)}
        >
          {options.confirmLabel}
        </button>
      </div>
    </Modal>
  ) : null

  return [element, ask]
}
