import { fetchAdminDashboardData, type AdminDashboardData } from '@renderer/data/adminDashboard'
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseAdminDashboardResult {
  data: AdminDashboardData | null
  error: string | null
  isLoading: boolean
  reload: VoidFunction
}

export function useAdminDashboard(): UseAdminDashboardResult {
  const controllerRef = useRef<AbortController | null>(null)
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchDashboard = useCallback(async (controller: AbortController): Promise<void> => {
    try {
      const dashboard = await fetchAdminDashboardData(controller.signal)

      setData(dashboard)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return
      }

      setError(cause instanceof Error ? cause.message : 'The dashboard could not be loaded.')
    } finally {
      if (controllerRef.current === controller) {
        setIsLoading(false)
      }
    }
  }, [])

  const reload = useCallback((): void => {
    controllerRef.current?.abort()

    const controller = new AbortController()

    controllerRef.current = controller
    setError(null)
    setIsLoading(true)
    void fetchDashboard(controller)
  }, [fetchDashboard])

  useEffect(() => {
    const controller = new AbortController()

    controllerRef.current = controller
    void fetchAdminDashboardData(controller.signal)
      .then((dashboard) => setData(dashboard))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }

        setError(cause instanceof Error ? cause.message : 'The dashboard could not be loaded.')
      })
      .finally(() => {
        if (controllerRef.current === controller) {
          setIsLoading(false)
        }
      })

    return () => controllerRef.current?.abort()
  }, [])

  return { data, error, isLoading, reload }
}
