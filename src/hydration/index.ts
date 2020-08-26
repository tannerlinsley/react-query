export { dehydrate, hydrate } from './hydration'
export { useHydrate, ReactQueryCacheProvider } from './react'

// Types
export type {
  DehydratedQueryConfig,
  DehydratedQuery,
  DehydratedQueries,
  QueryKeyParserFunction,
  ShouldDehydrateFunction,
  ShouldHydrateFunction,
  HydrateConfig,
  DehydrateConfig,
} from './hydration'
export type { HydrationCacheProviderProps } from './react'
