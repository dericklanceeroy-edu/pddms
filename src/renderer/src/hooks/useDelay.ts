import { useEffect } from 'react'

/**
 * Delays the invocation of the callback function.
 */
export function useDelay(callback: VoidFunction, delayInMs: number): void {
  useEffect(() => {
    const timeoutId = setTimeout(callback, delayInMs * 1000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [callback, delayInMs])
}
