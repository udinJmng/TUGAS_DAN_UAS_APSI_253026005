/**
 * useApi — a lightweight hook for API calls with loading/error state.
 *
 * Usage:
 *   const { data, loading, error, run } = useApi(songApi.list)
 *   useEffect(() => { run() }, [])
 */
import { useState, useCallback } from 'react'

interface State<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<TArgs extends unknown[], TData>(
  fn: (...args: TArgs) => Promise<TData>
) {
  const [state, setState] = useState<State<TData>>({ data: null, loading: false, error: null })

  const run = useCallback(async (...args: TArgs) => {
    setState({ data: null, loading: true, error: null })
    try {
      const data = await fn(...args)
      setState({ data, loading: false, error: null })
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setState({ data: null, loading: false, error: message })
      throw err
    }
  }, [fn])

  return { ...state, run }
}

/**
 * Simple async wrapper — fire-and-forget with optional callbacks.
 * Useful for mutations (like, delete, etc.) where you don't need
 * the full loading state in the component.
 */
export async function apiCall<T>(
  fn: () => Promise<T>,
  onSuccess?: (data: T) => void,
  onError?: (msg: string) => void,
): Promise<T | null> {
  try {
    const data = await fn()
    onSuccess?.(data)
    return data
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Request failed'
    onError?.(msg)
    return null
  }
}
