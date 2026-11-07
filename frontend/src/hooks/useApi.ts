import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'

export interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  refetch: () => void
}

function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause
  if (cause instanceof Error) return new ApiError(cause.message)
  return new ApiError('Something went wrong while contacting the API.')
}

// Run an API call when its dependencies change and keep the latest result,
// so a page can render loading, error and data states without boilerplate.
export function useApi<T>(fetcher: () => Promise<T>, deps: readonly unknown[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetcher().then(
      (value) => {
        if (active) {
          setData(value)
          setLoading(false)
        }
      },
      (cause: unknown) => {
        if (active) {
          setError(toApiError(cause))
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
    }
    // The fetcher is intentionally excluded: callers pass the values it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const refetch = useCallback(() => setTick((current) => current + 1), [])
  return { data, loading, error, refetch }
}
