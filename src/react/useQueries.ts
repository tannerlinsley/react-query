import React from 'react'

import { notifyManager } from '../core/notifyManager'
import { QueriesObserver } from '../core/queriesObserver'
import { useQueryClient } from './QueryClientProvider'
import { useQueryErrorResetBoundary } from './QueryErrorResetBoundary'
import { UseQueryOptions, UseQueryResult } from './types'

export function useQueries(queries: UseQueryOptions[]): UseQueryResult[] {
  const mountedRef = React.useRef(false)
  const [, forceUpdate] = React.useState(0)

  const queryClient = useQueryClient()
  const errorResetBoundary = useQueryErrorResetBoundary()

  const defaultedQueries = queries.map(options => {
    const defaultedOptions = queryClient.defaultQueryObserverOptions(options)

    // Make sure the results are already in fetching state before subscribing or updating options
    defaultedOptions.optimisticResults = true

    return defaultedOptions
  })

  const observerRef = React.useRef(
    new QueriesObserver(queryClient, defaultedQueries)
  )

  const result = observerRef.current.getOptimisticResult(defaultedQueries)

  React.useEffect(() => {
    // Do not notify on updates because of changes in the options because
    // these changes should already be reflected in the optimistic result.
    observerRef.current.setQueries(defaultedQueries, { listeners: false })
  }, [defaultedQueries])

  const someSuspense = defaultedQueries.some(q => q.suspense)
  const someUseErrorBoundary = defaultedQueries.some(q => q.useErrorBoundary)
  const firstResultWithError = result.find(r => r.error)
  const someError = firstResultWithError?.error
  const someIsLoading = result.some(r => r.isLoading)

  React.useEffect(() => {
    mountedRef.current = true

    const unsubscribe = observerRef.current.subscribe(
      notifyManager.batchCalls(() => {
        if (mountedRef.current && someIsLoading) {
          forceUpdate(x => x + 1)
        }
      })
    )

    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [someIsLoading])

  const handleReset = React.useCallback(() => {
    errorResetBoundary.clearReset()
    const unsubscribe = observerRef.current.subscribe()
    throw observerRef.current
      .refetch({ filter: x => x.getCurrentResult().isLoading })
      .finally(unsubscribe)
  }, [errorResetBoundary])

  // Handle suspense and error boundaries
  if (someSuspense || someUseErrorBoundary) {
    if (someError) {
      if (errorResetBoundary.isReset()) {
        handleReset()
      }
      throw someError
    }

    if (someSuspense && someIsLoading) {
      handleReset()
    }
  }

  return result
}
