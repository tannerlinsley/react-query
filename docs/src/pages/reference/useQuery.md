---
id: useQuery
title: useQuery
---

```js
const {
  data,
  dataUpdatedAt,
  error,
  errorUpdatedAt,
  failureCount,
  isError,
  isFetched,
  isFetchedAfterMount,
  isFetching,
  isIdle,
  isLoading,
  isLoadingError,
  isPlaceholderData,
  isPreviousData,
  isRefetchError,
  isRefetching,
  isStale,
  isSuccess,
  refetch,
  remove,
  status,
} = useQuery(queryKey, queryFn?, {
  cacheTime,
  enabled,
  initialData,
  initialDataUpdatedAt
  isDataEqual,
  keepPreviousData,
  notifyOnChangeProps,
  notifyOnChangePropsExclusions,
  onError,
  onSettled,
  onSuccess,
  queryKeyHashFn,
  refetchInterval,
  refetchIntervalInBackground,
  refetchOnMount,
  refetchOnReconnect,
  refetchOnWindowFocus,
  retry,
  retryOnMount,
  retryDelay,
  select,
  staleTime,
  structuralSharing,
  suspense,
  useErrorBoundary,
})

// or using the object syntax

const result = useQuery({
  queryKey,
  queryFn,
  enabled,
})
```

**Options**

- `queryKey: string | unknown[]`
  - **Required**
  - The query key to use for this query.
  - The query key will be hashed into a stable hash. See [Query Keys](../guides/query-keys) for more information.
  - The query will automatically update when this key changes (as long as `enabled` is not set to `false`).
- `queryFn: (context: QueryFunctionContext) => Promise<TData>`
  - **Required, but only if no default query function has been defined** See [Default Query Function](../guides/default-query-function) for more information.
  - The function that the query will use to request data.
  - Receives a `QueryFunctionContext` object with the following variables:
    - `queryKey: EnsuredQueryKey`: the queryKey, guaranteed to be an Array
  - Must return a promise that will either resolve data or throw an error.
- `enabled: boolean`
  - Set this to `false` to disable this query from automatically running.
  - Can be used for [Dependent Queries](../guides/dependent-queries).
- `retry: boolean | number | (failureCount: number, error: TError) => boolean`
  - If `false`, failed queries will not retry by default.
  - If `true`, failed queries will retry infinitely.
  - If set to a `number`, e.g. `3`, failed queries will retry until the failed query count meets that number.
- `retryOnMount: boolean`
  - If set to `false`, the query will not be retried on mount if it contains an error. Defaults to `true`.
- `retryDelay: number | (retryAttempt: number, error: TError) => number`
  - This function receives a `retryAttempt` integer and the actual Error and returns the delay to apply before the next attempt in milliseconds.
  - A function like `attempt => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30 * 1000)` applies exponential backoff.
  - A function like `attempt => attempt * 1000` applies linear backoff.
- `staleTime: number | Infinity`
  - Optional
  - Defaults to `0`
  - The time in milliseconds after data is considered stale. This value only applies to the hook it is defined on.
  - If set to `Infinity`, the data will never be considered stale
- `cacheTime: number | Infinity`
  - The time in milliseconds that unused/inactive cache data remains in memory. When a query's cache becomes unused or inactive, that cache data will be garbage collected after this duration. When different cache times are specified, the longest one will be used.
  - If set to `Infinity`, will disable garbage collection
- `queryKeyHashFn: (queryKey: QueryKey) => string`
  - Optional
  - If specified, this function is used to hash the `queryKey` to a string.
- `refetchInterval: false | number`
  - Optional
  - If set to a number, all queries will continuously refetch at this frequency in milliseconds
- `refetchIntervalInBackground: boolean`
  - Optional
  - If set to `true`, queries that are set to continuously refetch with a `refetchInterval` will continue to refetch while their tab/window is in the background
- `refetchOnMount: boolean | "always"`
  - Optional
  - Defaults to `true`
  - If set to `true`, the query will refetch on mount if the data is stale.
  - If set to `false`, the query will not refetch on mount.
  - If set to `"always"`, the query will always refetch on mount.
- `refetchOnWindowFocus: boolean | "always"`
  - Optional
  - Defaults to `true`
  - If set to `true`, the query will refetch on window focus if the data is stale.
  - If set to `false`, the query will not refetch on window focus.
  - If set to `"always"`, the query will always refetch on window focus.
- `refetchOnReconnect: boolean | "always"`
  - Optional
  - Defaults to `true`
  - If set to `true`, the query will refetch on reconnect if the data is stale.
  - If set to `false`, the query will not refetch on reconnect.
  - If set to `"always"`, the query will always refetch on reconnect.
- `notifyOnChangeProps: string[] | "tracked"`
  - Optional
  - If set, the component will only re-render if any of the listed properties change.
  - If set to `['data', 'error']` for example, the component will only re-render when the `data` or `error` properties change.
  - If set to `"tracked"`, access to properties will be tracked, and the component will only re-render when one of the tracked properties change.
- `notifyOnChangePropsExclusions: string[]`
  - Optional
  - If set, the component will not re-render if any of the listed properties change.
  - If set to `['isStale']` for example, the component will not re-render when the `isStale` property changes.
- `onSuccess: (data: TData) => void`
  - Optional
  - This function will fire any time the query successfully fetches new data.
- `onError: (error: TError) => void`
  - Optional
  - This function will fire if the query encounters an error and will be passed the error.
- `onSettled: (data?: TData, error?: TError) => void`
  - Optional
  - This function will fire any time the query is either successfully fetched or errors and be passed either the data or error
- `select: (data: TData) => unknown`
  - Optional
  - This option can be used to transform or select a part of the data returned by the query function.
- `suspense: boolean`
  - Optional
  - Set this to `true` to enable suspense mode.
  - When `true`, `useQuery` will suspend when `status === 'loading'`
  - When `true`, `useQuery` will throw runtime errors when `status === 'error'`
- `initialData: TData | () => TData`
  - Optional
  - If set, this value will be used as the initial data for the query cache (as long as the query hasn't been created or cached yet)
  - If set to a function, the function will be called **once** during the shared/root query initialization, and be expected to synchronously return the initialData
  - Initial data is considered stale by default unless a `staleTime` has been set.
  - `initialData` **is persisted** to the cache
- `initialDataUpdatedAt: number | (() => number | undefined)`
  - Optional
  - If set, this value will be used as the time (in milliseconds) of when the `initialData` itself was last updated.
- `placeholderData: TData | () => TData`
  - Optional
  - If set, this value will be used as the placeholder data for this particular query observer while the query is still in the `loading` data and no initialData has been provided.
  - `placeholderData` is **not persisted** to the cache
- `keepPreviousData: boolean`
  - Optional
  - Defaults to `false`
  - If set, any previous `data` will be kept when fetching new data because the query key changed.
- `structuralSharing: boolean`
  - Optional
  - Defaults to `true`
  - If set to `false`, structural sharing between query results will be disabled.
- `useErrorBoundary: boolean`
  - Defaults to the global query config's `useErrorBoundary` value, which is false
  - Set this to true if you want errors to be thrown in the render phase and propagated to the nearest error boundary

**Returns**

- `status: String`
  - Will be:
    - `idle` if the query is idle. This only happens if a query is initialized with `enabled: false` and no initial data is available.
    - `loading` if the query is in a "hard" loading state. This means there is no cached data and the query is currently fetching, eg `isFetching === true`
    - `error` if the query attempt resulted in an error. The corresponding `error` property has the error received from the attempted fetch
    - `success` if the query has received a response with no errors and is ready to display its data. The corresponding `data` property on the query is the data received from the successful fetch or if the query's `enabled` property is set to `false` and has not been fetched yet `data` is the first `initialData` supplied to the query on initialization.
- `isIdle: boolean`
  - A derived boolean from the `status` variable above, provided for convenience.
- `isLoading: boolean`
  - A derived boolean from the `status` variable above, provided for convenience.
- `isSuccess: boolean`
  - A derived boolean from the `status` variable above, provided for convenience.
- `isError: boolean`
  - A derived boolean from the `status` variable above, provided for convenience.
- `isLoadingError: boolean`
  - Will be `true` if the query failed while fetching for the first time.
- `isRefetchError: boolean`
  - Will be `true` if the query failed while refetching.
- `data: TData`
  - Defaults to `undefined`.
  - The last successfully resolved data for the query.
- `dataUpdatedAt: number`
  - The timestamp for when the query most recently returned the `status` as `"success"`.
- `error: null | TError`
  - Defaults to `null`
  - The error object for the query, if an error was thrown.
- `errorUpdatedAt: number`
  - The timestamp for when the query most recently returned the `status` as `"error"`.
- `isStale: boolean`
  - Will be `true` if the data in the cache is invalidated or if the data is older than the given `staleTime`.
- `isPlaceholderData: boolean`
  - Will be `true` if the data shown is the placeholder data.
- `isPreviousData: boolean`
  - Will be `true` when `keepPreviousData` is set and data from the previous query is returned.
- `isFetched: boolean`
  - Will be `true` if the query has been fetched.
- `isFetchedAfterMount: boolean`
  - Will be `true` if the query has been fetched after the component mounted.
  - This property can be used to not show any previously cached data.
- `isFetching: boolean`
  - Is `true` whenever a request is in-flight, which includes initial `loading` as well as background refetches.
  - Will be `true` if the query is currently fetching, including background fetching.
- `isRefetching: boolean`
  - Is `true` whenever a background refetch is in-flight, which _does not_ include initial `loading`
  - Is the same as `isFetching && !isLoading`
- `failureCount: number`
  - The failure count for the query.
  - Incremented every time the query fails.
  - Reset to `0` when the query succeeds.
- `refetch: (options: { throwOnError: boolean, cancelRefetch: boolean }) => Promise<UseQueryResult>`
  - A function to manually refetch the query.
  - If the query errors, the error will only be logged. If you want an error to be thrown, pass the `throwOnError: true` option
  - If `cancelRefetch` is `true`, then the current request will be cancelled before a new request is made
- `remove: () => void`
  - A function to remove the query from the cache.
