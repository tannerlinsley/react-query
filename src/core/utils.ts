import type { Mutation } from './mutation'
import type { Query } from './query'
import { EnsuredQueryKey } from './types'
import type {
  MutationFunction,
  MutationKey,
  MutationOptions,
  QueryFunction,
  QueryKey,
  QueryOptions,
} from './types'

// TYPES

export interface QueryFilters {
  /**
   * Include or exclude active queries
   */
  active?: boolean
  /**
   * Match query key exactly
   */
  exact?: boolean
  /**
   * Include or exclude inactive queries
   */
  inactive?: boolean
  /**
   * Include queries matching this predicate function
   */
  predicate?: (query: Query) => boolean
  /**
   * Include queries matching this query key
   */
  queryKey?: QueryKey
  /**
   * Include or exclude stale queries
   */
  stale?: boolean
  /**
   * Include or exclude fetching queries
   */
  fetching?: boolean
}

export interface MutationFilters {
  /**
   * Match mutation key exactly
   */
  exact?: boolean
  /**
   * Include mutations matching this predicate function
   */
  predicate?: (mutation: Mutation<any, any, any>) => boolean
  /**
   * Include mutations matching this mutation key
   */
  mutationKey?: MutationKey
  /**
   * Include or exclude fetching mutations
   */
  fetching?: boolean
}

export type DataUpdateFunction<TInput, TOutput> = (input: TInput) => TOutput

export type Updater<TInput, TOutput> =
  | TOutput
  | DataUpdateFunction<TInput, TOutput>

export type QueryStatusFilter = 'all' | 'active' | 'inactive' | 'none'

// UTILS

export const isServer = typeof window === 'undefined'

export function noop(): undefined {
  return undefined
}

export function functionalUpdate<TInput, TOutput>(
  updater: Updater<TInput, TOutput>,
  input: TInput
): TOutput {
  return typeof updater === 'function'
    ? (updater as DataUpdateFunction<TInput, TOutput>)(input)
    : updater
}

export function isValidTimeout(value: any): value is number {
  return typeof value === 'number' && value >= 0 && value !== Infinity
}

export function ensureQueryKeyArray<T extends QueryKey>(
  value: T
): EnsuredQueryKey<T> {
  return (Array.isArray(value)
    ? value
    : ([value] as unknown)) as EnsuredQueryKey<T>
}

export function difference<T>(array1: T[], array2: T[]): T[] {
  return array1.filter(x => array2.indexOf(x) === -1)
}

export function replaceAt<T>(array: T[], index: number, value: T): T[] {
  const copy = array.slice(0)
  copy[index] = value
  return copy
}

export function timeUntilStale(updatedAt: number, staleTime?: number): number {
  return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0)
}

export function parseQueryArgs<
  TOptions extends QueryOptions<any, any, any, TQueryKey>,
  TQueryKey extends QueryKey = QueryKey
>(
  arg1: TQueryKey | TOptions,
  arg2?: QueryFunction<any, TQueryKey> | TOptions,
  arg3?: TOptions
): TOptions {
  if (!isQueryKey(arg1)) {
    return arg1 as TOptions
  }

  if (typeof arg2 === 'function') {
    return { ...arg3, queryKey: arg1, queryFn: arg2 } as TOptions
  }

  return { ...arg2, queryKey: arg1 } as TOptions
}

export function parseMutationArgs<
  TOptions extends MutationOptions<any, any, any, any>
>(
  arg1: MutationKey | MutationFunction<any, any> | TOptions,
  arg2?: MutationFunction<any, any> | TOptions,
  arg3?: TOptions
): TOptions {
  if (isQueryKey(arg1)) {
    if (typeof arg2 === 'function') {
      return { ...arg3, mutationKey: arg1, mutationFn: arg2 } as TOptions
    }
    return { ...arg2, mutationKey: arg1 } as TOptions
  }

  if (typeof arg1 === 'function') {
    return { ...arg2, mutationFn: arg1 } as TOptions
  }

  return { ...arg1 } as TOptions
}

export function parseFilterArgs<
  TFilters extends QueryFilters,
  TOptions = unknown
>(
  arg1?: QueryKey | TFilters,
  arg2?: TFilters | TOptions,
  arg3?: TOptions
): [TFilters, TOptions | undefined] {
  return (isQueryKey(arg1)
    ? [{ ...arg2, queryKey: arg1 }, arg3]
    : [arg1 || {}, arg2]) as [TFilters, TOptions]
}

export function parseMutationFilterArgs(
  arg1?: QueryKey | MutationFilters,
  arg2?: MutationFilters
): MutationFilters | undefined {
  return isQueryKey(arg1) ? { ...arg2, mutationKey: arg1 } : arg1
}

export function mapQueryStatusFilter(
  active?: boolean,
  inactive?: boolean
): QueryStatusFilter {
  if (
    (active === true && inactive === true) ||
    (active == null && inactive == null)
  ) {
    return 'all'
  } else if (active === false && inactive === false) {
    return 'none'
  } else {
    // At this point, active|inactive can only be true|false or false|true
    // so, when only one value is provided, the missing one has to be the negated value
    const isActive = active ?? !inactive
    return isActive ? 'active' : 'inactive'
  }
}

export function matchQuery(
  filters: QueryFilters,
  query: Query<any, any, any, any>
): boolean {
  const {
    active,
    exact,
    fetching,
    inactive,
    predicate,
    queryKey,
    stale,
  } = filters

  if (isQueryKey(queryKey)) {
    if (exact) {
      if (query.queryHash !== hashQueryKeyByOptions(queryKey, query.options)) {
        return false
      }
    } else if (!partialMatchKey(query.queryKey, queryKey)) {
      return false
    }
  }

  const queryStatusFilter = mapQueryStatusFilter(active, inactive)

  if (queryStatusFilter === 'none') {
    return false
  } else if (queryStatusFilter !== 'all') {
    const isActive = query.isActive()
    if (queryStatusFilter === 'active' && !isActive) {
      return false
    }
    if (queryStatusFilter === 'inactive' && isActive) {
      return false
    }
  }

  if (typeof stale === 'boolean' && query.isStale() !== stale) {
    return false
  }

  if (typeof fetching === 'boolean' && query.isFetching() !== fetching) {
    return false
  }

  if (predicate && !predicate(query)) {
    return false
  }

  return true
}

export function matchMutation(
  filters: MutationFilters,
  mutation: Mutation<any, any>
): boolean {
  const { exact, fetching, predicate, mutationKey } = filters
  if (isQueryKey(mutationKey)) {
    if (!mutation.options.mutationKey) {
      return false
    }
    if (exact) {
      if (
        hashQueryKey(mutation.options.mutationKey) !== hashQueryKey(mutationKey)
      ) {
        return false
      }
    } else if (!partialMatchKey(mutation.options.mutationKey, mutationKey)) {
      return false
    }
  }

  if (
    typeof fetching === 'boolean' &&
    (mutation.state.status === 'loading') !== fetching
  ) {
    return false
  }

  if (predicate && !predicate(mutation)) {
    return false
  }

  return true
}

export function hashQueryKeyByOptions<TQueryKey extends QueryKey = QueryKey>(
  queryKey: TQueryKey,
  options?: QueryOptions<any, any, any, TQueryKey>
): string {
  const hashFn = options?.queryKeyHashFn || hashQueryKey
  return hashFn(queryKey)
}

/**
 * Default query keys hash function.
 */
export function hashQueryKey(queryKey: QueryKey): string {
  const asArray = ensureQueryKeyArray(queryKey)
  return stableValueHash(asArray)
}

/**
 * Hashes the value into a stable hash.
 */
export function stableValueHash(value: any): string {
  return JSON.stringify(value, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce((result, key) => {
            result[key] = val[key]
            return result
          }, {} as any)
      : val
  )
}

/**
 * Checks if key `b` partially matches with key `a`.
 */
export function partialMatchKey(a: QueryKey, b: QueryKey): boolean {
  return partialDeepEqual(ensureQueryKeyArray(a), ensureQueryKeyArray(b))
}

/**
 * Checks if `b` partially matches with `a`.
 */
export function partialDeepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return !Object.keys(b).some(key => !partialDeepEqual(a[key], b[key]))
  }

  return false
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
export function replaceEqualDeep<T>(a: unknown, b: T): T
export function replaceEqualDeep(a: any, b: any): any {
  if (a === b) {
    return a
  }

  const array = Array.isArray(a) && Array.isArray(b)

  if (array || (isPlainObject(a) && isPlainObject(b))) {
    const aSize = array ? a.length : Object.keys(a).length
    const bItems = array ? b : Object.keys(b)
    const bSize = bItems.length
    const copy: any = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i]
      copy[key] = replaceEqualDeep(a[key], b[key])
      if (copy[key] === a[key]) {
        equalItems++
      }
    }

    return aSize === bSize && equalItems === aSize ? a : copy
  }

  return b
}

/**
 * Shallow compare objects. Only works with objects that always have the same properties.
 */
export function shallowEqualObjects<T>(a: T, b: T): boolean {
  if ((a && !b) || (b && !a)) {
    return false
  }

  for (const key in a) {
    if (a[key] !== b[key]) {
      return false
    }
  }

  return true
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
export function isPlainObject(o: any): o is Object {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any): boolean {
  return Object.prototype.toString.call(o) === '[object Object]'
}

export function isQueryKey(value: any): value is QueryKey {
  return typeof value === 'string' || Array.isArray(value)
}

export function isError(value: any): value is Error {
  return value instanceof Error
}

export function sleep(timeout: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, timeout)
  })
}

/**
 * Schedules a microtask.
 * This can be useful to schedule state updates after rendering.
 */
export function scheduleMicrotask(callback: () => void): void {
  Promise.resolve()
    .then(callback)
    .catch(error =>
      setTimeout(() => {
        throw error
      })
    )
}
