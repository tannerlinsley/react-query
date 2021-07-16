import {
  isServer,
  isValidTimeout,
  noop,
  replaceEqualDeep,
  shallowEqualObjects,
  timeUntilStale,
} from './utils'
import { notifyManager } from './notifyManager'
import type {
  PlaceholderDataFunction,
  QueryKey,
  QueryObserverBaseResult,
  QueryObserverOptions,
  QueryObserverResult,
  QueryOptions,
  RefetchOptions,
  ResultOptions,
} from './types'
import type { Query, QueryState, Action, FetchOptions } from './query'
import type { QueryClient } from './queryClient'
import { focusManager } from './focusManager'
import { Subscribable } from './subscribable'
import { getLogger } from './logger'
import { isCancelledError } from './retryer'

type QueryObserverListener<TData, TError> = (
  result: QueryObserverResult<TData, TError>
) => void

export interface NotifyOptions {
  cache?: boolean
  listeners?: boolean
  onError?: boolean
  onSuccess?: boolean
}

export interface ObserverFetchOptions extends FetchOptions {
  throwOnError?: boolean
}

export class QueryObserver<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends Subscribable<QueryObserverListener<TData, TError>> {
  options: QueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >

  private client: QueryClient
  private currentQuery!: Query<TQueryFnData, TError, TQueryData, TQueryKey>
  private currentQueryInitialState!: QueryState<TQueryData, TError>
  private currentResult!: QueryObserverResult<TData, TError>
  private currentResultState?: QueryState<TQueryData, TError>
  private currentResultOptions?: QueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >
  private previousQueryResult?: QueryObserverResult<TData, TError>
  private previousSelectError: Error | null
  private staleTimeoutId?: number
  private refetchIntervalId?: number
  private trackedProps!: Array<keyof QueryObserverResult>

  constructor(
    client: QueryClient,
    options: QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >
  ) {
    super()

    this.client = client
    this.options = options
    this.trackedProps = []
    this.previousSelectError = null
    this.bindMethods()
    this.setOptions(options)
  }

  protected bindMethods(): void {
    this.remove = this.remove.bind(this)
    this.refetch = this.refetch.bind(this)
  }

  protected onSubscribe(): void {
    if (this.listeners.length === 1) {
      this.currentQuery.addObserver(this)

      if (shouldFetchOnMount(this.currentQuery, this.options)) {
        this.executeFetch()
      }

      this.updateTimers()
    }
  }

  protected onUnsubscribe(): void {
    if (!this.listeners.length) {
      this.destroy()
    }
  }

  shouldFetchOnReconnect(): boolean {
    return shouldFetchOnReconnect(this.currentQuery, this.options)
  }

  shouldFetchOnWindowFocus(): boolean {
    return shouldFetchOnWindowFocus(this.currentQuery, this.options)
  }

  destroy(): void {
    this.listeners = []
    this.clearTimers()
    this.currentQuery.removeObserver(this)
  }

  setOptions(
    options?: QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >,
    notifyOptions?: NotifyOptions
  ): void {
    const prevOptions = this.options
    const prevQuery = this.currentQuery

    this.options = this.client.defaultQueryObserverOptions(options)

    if (
      typeof this.options.enabled !== 'undefined' &&
      typeof this.options.enabled !== 'boolean'
    ) {
      throw new Error('Expected enabled to be a boolean')
    }

    // Keep previous query key if the user does not supply one
    if (!this.options.queryKey) {
      this.options.queryKey = prevOptions.queryKey
    }

    this.updateQuery()

    const mounted = this.hasListeners()

    // Fetch if there are subscribers
    if (
      mounted &&
      shouldFetchOptionally(
        this.currentQuery,
        prevQuery,
        this.options,
        prevOptions
      )
    ) {
      this.executeFetch()
    }

    // Update result
    this.updateResult(notifyOptions)

    // Update stale interval if needed
    if (
      mounted &&
      (this.currentQuery !== prevQuery ||
        this.options.enabled !== prevOptions.enabled ||
        this.options.staleTime !== prevOptions.staleTime)
    ) {
      this.updateStaleTimeout()
    }

    // Update refetch interval if needed
    if (
      mounted &&
      (this.currentQuery !== prevQuery ||
        this.options.enabled !== prevOptions.enabled ||
        this.options.refetchInterval !== prevOptions.refetchInterval)
    ) {
      this.updateRefetchInterval()
    }
  }

  getOptimisticResult(
    options: QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >
  ): QueryObserverResult<TData, TError> {
    const defaultedOptions = this.client.defaultQueryObserverOptions(options)

    const query = this.client
      .getQueryCache()
      .build(
        this.client,
        defaultedOptions as QueryOptions<
          TQueryFnData,
          TError,
          TQueryData,
          TQueryKey
        >
      )

    return this.createResult(query, defaultedOptions)
  }

  getCurrentResult(): QueryObserverResult<TData, TError> {
    return this.currentResult
  }

  trackResult(
    result: QueryObserverResult<TData, TError>
  ): QueryObserverResult<TData, TError> {
    const trackedResult = {} as QueryObserverResult<TData, TError>

    Object.keys(result).forEach(key => {
      Object.defineProperty(trackedResult, key, {
        configurable: false,
        enumerable: true,
        get: () => {
          const typedKey = key as keyof QueryObserverResult
          if (!this.trackedProps.includes(typedKey)) {
            this.trackedProps.push(typedKey)
          }
          return result[typedKey]
        },
      })
    })

    return trackedResult
  }

  getNextResult(
    options?: ResultOptions
  ): Promise<QueryObserverResult<TData, TError>> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe(result => {
        if (!result.isFetching) {
          unsubscribe()
          if (result.isError && options?.throwOnError) {
            reject(result.error)
          } else {
            resolve(result)
          }
        }
      })
    })
  }

  getCurrentQuery(): Query<TQueryFnData, TError, TQueryData, TQueryKey> {
    return this.currentQuery
  }

  remove(): void {
    this.client.getQueryCache().remove(this.currentQuery)
  }

  refetch(
    options?: RefetchOptions
  ): Promise<QueryObserverResult<TData, TError>> {
    return this.fetch(options)
  }

  fetchOptimistic(
    options: QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >
  ): Promise<QueryObserverResult<TData, TError>> {
    const defaultedOptions = this.client.defaultQueryObserverOptions(options)

    const query = this.client
      .getQueryCache()
      .build(
        this.client,
        defaultedOptions as QueryOptions<
          TQueryFnData,
          TError,
          TQueryData,
          TQueryKey
        >
      )

    return query.fetch().then(() => this.createResult(query, defaultedOptions))
  }

  protected fetch(
    fetchOptions?: ObserverFetchOptions
  ): Promise<QueryObserverResult<TData, TError>> {
    return this.executeFetch(fetchOptions).then(() => {
      this.updateResult()
      return this.currentResult
    })
  }

  private executeFetch(
    fetchOptions?: ObserverFetchOptions
  ): Promise<TQueryData | undefined> {
    // Make sure we reference the latest query as the current one might have been removed
    this.updateQuery()

    // Fetch
    let promise: Promise<TQueryData | undefined> = this.currentQuery.fetch(
      this.options as QueryOptions<TQueryFnData, TError, TQueryData, TQueryKey>,
      fetchOptions
    )

    if (!fetchOptions?.throwOnError) {
      promise = promise.catch(noop)
    }

    return promise
  }

  private updateStaleTimeout(): void {
    this.clearStaleTimeout()

    if (
      isServer ||
      this.currentResult.isStale ||
      !isValidTimeout(this.options.staleTime)
    ) {
      return
    }

    const time = timeUntilStale(
      this.currentResult.dataUpdatedAt,
      this.options.staleTime
    )

    // The timeout is sometimes triggered 1 ms before the stale time expiration.
    // To mitigate this issue we always add 1 ms to the timeout.
    const timeout = time + 1

    this.staleTimeoutId = setTimeout(() => {
      if (!this.currentResult.isStale) {
        this.updateResult()
      }
    }, timeout)
  }

  private updateRefetchInterval(): void {
    this.clearRefetchInterval()

    if (
      isServer ||
      this.options.enabled === false ||
      !isValidTimeout(this.options.refetchInterval)
    ) {
      return
    }

    this.refetchIntervalId = setInterval(() => {
      if (
        this.options.refetchIntervalInBackground ||
        focusManager.isFocused()
      ) {
        this.executeFetch()
      }
    }, this.options.refetchInterval)
  }

  private updateTimers(): void {
    this.updateStaleTimeout()
    this.updateRefetchInterval()
  }

  private clearTimers(): void {
    this.clearStaleTimeout()
    this.clearRefetchInterval()
  }

  private clearStaleTimeout(): void {
    clearTimeout(this.staleTimeoutId)
    this.staleTimeoutId = undefined
  }

  private clearRefetchInterval(): void {
    clearInterval(this.refetchIntervalId)
    this.refetchIntervalId = undefined
  }

  protected createResult(
    query: Query<TQueryFnData, TError, TQueryData, TQueryKey>,
    options: QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >
  ): QueryObserverResult<TData, TError> {
    const prevQuery = this.currentQuery
    const prevOptions = this.options
    const prevResult = this.currentResult
    const prevResultState = this.currentResultState
    const prevResultOptions = this.currentResultOptions
    const queryChange = query !== prevQuery
    const queryInitialState = queryChange
      ? query.state
      : this.currentQueryInitialState
    const prevQueryResult = queryChange
      ? this.currentResult
      : this.previousQueryResult

    const { state } = query
    let { dataUpdatedAt, error, errorUpdatedAt, isFetching, status } = state
    let isPreviousData = false
    let isPlaceholderData = false
    let data: TData | undefined

    // Optimistically set result in fetching state if needed
    if (options.optimisticResults) {
      const mounted = this.hasListeners()

      const fetchOnMount = !mounted && shouldFetchOnMount(query, options)

      const fetchOptionally =
        mounted && shouldFetchOptionally(query, prevQuery, options, prevOptions)

      if (fetchOnMount || fetchOptionally) {
        isFetching = true
        if (!dataUpdatedAt) {
          status = 'loading'
        }
      }
    }

    // Keep previous data if needed
    if (
      options.keepPreviousData &&
      !state.dataUpdateCount &&
      prevQueryResult?.isSuccess &&
      status !== 'error'
    ) {
      data = prevQueryResult.data
      dataUpdatedAt = prevQueryResult.dataUpdatedAt
      status = prevQueryResult.status
      isPreviousData = true
    }
    // Select data if needed
    else if (options.select && typeof state.data !== 'undefined') {
      // Memoize select result
      if (
        prevResult &&
        state.data === prevResultState?.data &&
        options.select === prevResultOptions?.select &&
        !this.previousSelectError
      ) {
        data = prevResult.data
      } else {
        try {
          data = options.select(state.data)
          if (options.structuralSharing !== false) {
            data = replaceEqualDeep(prevResult?.data, data)
          }
          this.previousSelectError = null
        } catch (selectError) {
          getLogger().error(selectError)
          error = selectError
          this.previousSelectError = selectError
          errorUpdatedAt = Date.now()
          status = 'error'
        }
      }
    }
    // Use query data
    else {
      data = (state.data as unknown) as TData
    }

    // Show placeholder data if needed
    if (
      typeof options.placeholderData !== 'undefined' &&
      typeof data === 'undefined' &&
      status === 'loading'
    ) {
      let placeholderData

      // Memoize placeholder data
      if (
        prevResult?.isPlaceholderData &&
        options.placeholderData === prevResultOptions?.placeholderData
      ) {
        placeholderData = prevResult.data
      } else {
        placeholderData =
          typeof options.placeholderData === 'function'
            ? (options.placeholderData as PlaceholderDataFunction<TQueryData>)()
            : options.placeholderData
        if (options.select && typeof placeholderData !== 'undefined') {
          try {
            placeholderData = options.select(placeholderData)
            if (options.structuralSharing !== false) {
              placeholderData = replaceEqualDeep(
                prevResult?.data,
                placeholderData
              )
            }
            this.previousSelectError = null
          } catch (selectError) {
            getLogger().error(selectError)
            error = selectError
            this.previousSelectError = selectError
            errorUpdatedAt = Date.now()
            status = 'error'
          }
        }
      }

      if (typeof placeholderData !== 'undefined') {
        status = 'success'
        data = placeholderData as TData
        isPlaceholderData = true
      }
    }

    const result: QueryObserverBaseResult<TData, TError> = {
      status,
      isLoading: status === 'loading',
      isSuccess: status === 'success',
      isError: status === 'error',
      isIdle: status === 'idle',
      data,
      dataUpdatedAt,
      error,
      errorUpdatedAt,
      failureCount: state.fetchFailureCount,
      isFetched: state.dataUpdateCount > 0 || state.errorUpdateCount > 0,
      isFetchedAfterMount:
        state.dataUpdateCount > queryInitialState.dataUpdateCount ||
        state.errorUpdateCount > queryInitialState.errorUpdateCount,
      isFetching,
      isRefetching: isFetching && status !== 'loading',
      isLoadingError: status === 'error' && state.dataUpdatedAt === 0,
      isPlaceholderData,
      isPreviousData,
      isRefetchError: status === 'error' && state.dataUpdatedAt !== 0,
      isStale: isStale(query, options),
      refetch: this.refetch,
      remove: this.remove,
    }

    return result as QueryObserverResult<TData, TError>
  }

  private shouldNotifyListeners(
    result: QueryObserverResult,
    prevResult?: QueryObserverResult
  ): boolean {
    if (!prevResult) {
      return true
    }

    if (result === prevResult) {
      return false
    }

    const { notifyOnChangeProps, notifyOnChangePropsExclusions } = this.options

    if (!notifyOnChangeProps && !notifyOnChangePropsExclusions) {
      return true
    }

    if (notifyOnChangeProps === 'tracked' && !this.trackedProps.length) {
      return true
    }

    const includedProps =
      notifyOnChangeProps === 'tracked'
        ? this.trackedProps
        : notifyOnChangeProps

    return Object.keys(result).some(key => {
      const typedKey = key as keyof QueryObserverResult
      const changed = result[typedKey] !== prevResult[typedKey]
      const isIncluded = includedProps?.some(x => x === key)
      const isExcluded = notifyOnChangePropsExclusions?.some(x => x === key)
      return changed && !isExcluded && (!includedProps || isIncluded)
    })
  }

  updateResult(notifyOptions?: NotifyOptions): void {
    const prevResult = this.currentResult as
      | QueryObserverResult<TData, TError>
      | undefined

    this.currentResult = this.createResult(this.currentQuery, this.options)
    this.currentResultState = this.currentQuery.state
    this.currentResultOptions = this.options

    // Only notify if something has changed
    if (shallowEqualObjects(this.currentResult, prevResult)) {
      return
    }

    // Determine which callbacks to trigger
    const defaultNotifyOptions: NotifyOptions = { cache: true }

    if (
      notifyOptions?.listeners !== false &&
      this.shouldNotifyListeners(this.currentResult, prevResult)
    ) {
      defaultNotifyOptions.listeners = true
    }

    this.notify({ ...defaultNotifyOptions, ...notifyOptions })
  }

  private updateQuery(): void {
    const query = this.client
      .getQueryCache()
      .build(
        this.client,
        this.options as QueryOptions<
          TQueryFnData,
          TError,
          TQueryData,
          TQueryKey
        >
      )

    if (query === this.currentQuery) {
      return
    }

    const prevQuery = this.currentQuery
    this.currentQuery = query
    this.currentQueryInitialState = query.state
    this.previousQueryResult = this.currentResult

    if (this.hasListeners()) {
      prevQuery?.removeObserver(this)
      query.addObserver(this)
    }
  }

  onQueryUpdate(action: Action<TData, TError>): void {
    const notifyOptions: NotifyOptions = {}

    if (action.type === 'success') {
      notifyOptions.onSuccess = true
    } else if (action.type === 'error' && !isCancelledError(action.error)) {
      notifyOptions.onError = true
    }

    this.updateResult(notifyOptions)

    if (this.hasListeners()) {
      this.updateTimers()
    }
  }

  private notify(notifyOptions: NotifyOptions): void {
    notifyManager.batch(() => {
      // First trigger the configuration callbacks
      if (notifyOptions.onSuccess) {
        this.options.onSuccess?.(this.currentResult.data!)
        this.options.onSettled?.(this.currentResult.data!, null)
      } else if (notifyOptions.onError) {
        this.options.onError?.(this.currentResult.error!)
        this.options.onSettled?.(undefined, this.currentResult.error!)
      }

      // Then trigger the listeners
      if (notifyOptions.listeners) {
        this.listeners.forEach(listener => {
          listener(this.currentResult)
        })
      }

      // Then the cache listeners
      if (notifyOptions.cache) {
        this.client
          .getQueryCache()
          .notify({ query: this.currentQuery, type: 'observerResultsUpdated' })
      }
    })
  }
}

function shouldLoadOnMount(
  query: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any>
): boolean {
  return (
    options.enabled !== false &&
    !query.state.dataUpdatedAt &&
    !(query.state.status === 'error' && options.retryOnMount === false)
  )
}

function shouldRefetchOnMount(
  query: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any>
): boolean {
  return (
    options.enabled !== false &&
    query.state.dataUpdatedAt > 0 &&
    (options.refetchOnMount === 'always' ||
      (options.refetchOnMount !== false && isStale(query, options)))
  )
}

function shouldFetchOnMount(
  query: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any, any>
): boolean {
  return (
    shouldLoadOnMount(query, options) || shouldRefetchOnMount(query, options)
  )
}

function shouldFetchOnReconnect(
  query: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any, any>
): boolean {
  return (
    options.enabled !== false &&
    (options.refetchOnReconnect === 'always' ||
      (options.refetchOnReconnect !== false && isStale(query, options)))
  )
}

function shouldFetchOnWindowFocus(
  query: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any, any>
): boolean {
  return (
    options.enabled !== false &&
    (options.refetchOnWindowFocus === 'always' ||
      (options.refetchOnWindowFocus !== false && isStale(query, options)))
  )
}

function shouldFetchOptionally(
  query: Query<any, any, any, any>,
  prevQuery: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any, any>,
  prevOptions: QueryObserverOptions<any, any, any, any, any>
): boolean {
  return (
    options.enabled !== false &&
    (query !== prevQuery || prevOptions.enabled === false) &&
    isStale(query, options)
  )
}

function isStale(
  query: Query<any, any, any, any>,
  options: QueryObserverOptions<any, any, any, any, any>
): boolean {
  return query.isStaleByTime(options.staleTime)
}
