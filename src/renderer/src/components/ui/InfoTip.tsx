import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { FiInfo } from 'react-icons/fi'

/**
 * Small "i" button that holds a section's or field's explanation, so screens show the task first
 * and the guidance only when it is wanted.
 *
 * Note: Opens on hover, keyboard focus or click (click keeps it open, for touch screens) and closes
 * on Escape, a click elsewhere, or moving away. The text is also linked to the button with
 * `aria-describedby` through a visually hidden copy, so screen readers announce it without opening
 * it. The bubble is portalled to the page body with fixed positioning so tables and dialogs that
 * scroll or clip their content never cut it off.
 */
export default function InfoTip({
  label,
  children,
  className = ''
}: {
  /** What the tip explains, read out as "About <label>". */
  label: string
  children: ReactNode
  className?: string
}): ReactElement {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean }>()
  const open = hovered || pinned

  const place = useCallback((): void => {
    const rect = button.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(320, window.innerWidth - 32)
    const left = Math.min(
      Math.max(16, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 16
    )
    const height = bubble.current?.offsetHeight ?? 0
    const above = rect.bottom + 8 + height > window.innerHeight - 8 && rect.top - 8 - height > 8
    setPosition({ top: above ? rect.top - 8 - height : rect.bottom + 8, left, above })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setPinned(false)
        setHovered(false)
      }
    }
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!button.current?.contains(target) && !bubble.current?.contains(target)) {
        setPinned(false)
        setHovered(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  return (
    <span className={`inline-flex align-middle ${className}`}>
      <button
        ref={button}
        type="button"
        className="info-tip-button"
        aria-label={`About ${label}`}
        aria-describedby={`${id}-text`}
        aria-expanded={open}
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <FiInfo aria-hidden="true" />
      </button>
      <span id={`${id}-text`} className="sr-only">
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={bubble}
            role="tooltip"
            className="info-tip-bubble"
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              width: Math.min(320, window.innerWidth - 32)
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {children}
          </div>,
          document.body
        )}
    </span>
  )
}

/**
 * Section or page heading with its explanation behind an "i" button, in place of a subtitle
 * paragraph.
 */
export function TitleWithInfo({
  as: Tag = 'h3',
  title,
  info,
  className = 'section-title',
  children
}: {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p'
  title: string
  info?: ReactNode
  className?: string
  /** Extra inline content after the title text, e.g. a count. */
  children?: ReactNode
}): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Tag className={className}>
        {title}
        {children}
      </Tag>
      {info && <InfoTip label={title}>{info}</InfoTip>}
    </div>
  )
}

/**
 * Table column heading with an "i" button, for columns whose rules need explaining.
 */
export function HeaderInfo({
  label,
  info,
  required = false
}: {
  label: string
  info: ReactNode
  required?: boolean
}): ReactElement {
  return (
    <span className="inline-flex items-center gap-1">
      <span>
        {label}
        {required && <span className="text-rose-600">*</span>}
      </span>
      <InfoTip label={label}>{info}</InfoTip>
    </span>
  )
}
