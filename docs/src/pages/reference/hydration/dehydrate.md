---
id: hydration/dehydrate
title: hydration/dehydrate
---

`dehydrate` creates a frozen representation of a `cache` that can later be hydrated with `Hydrate`, `useHydrate`, or `hydrate`. This is useful for passing prefetched queries from server to client or persisting queries to localstorage or other persistent locations. It only includes currently successful queries by default.

```js
import { dehydrate } from 'react-query/hydration'

const dehydratedState = dehydrate(queryClient, {
  shouldDehydrateQuery,
})
```

**Options**

- `client: QueryClient`
  - **Required**
  - The `queryClient` that should be dehydrated
- `options: DehydrateOptions`
  - Optional
  - `dehydrateMutations: boolean`
    - Optional
    - Whether or not to dehydrate mutations.
  - `dehydrateQueries: boolean`
    - Optional
    - Whether or not to dehydrate queries.
  - `shouldDehydrateMutation: (mutation: Mutation) => boolean`
    - Optional
    - This function is called for each mutation in the cache
    - Return `true` to include this mutation in dehydration, or `false` otherwise
    - The default version only includes paused mutations
  - `shouldDehydrateQuery: (query: Query) => boolean`
    - Optional
    - This function is called for each query in the cache
    - Return `true` to include this query in dehydration, or `false` otherwise
    - The default version only includes successful queries, do `shouldDehydrateQuery: () => true` to include all queries

**Returns**

- `dehydratedState: DehydratedState`
  - This includes everything that is needed to hydrate the `queryClient` at a later point
  - You **should not** rely on the exact format of this response, it is not part of the public API and can change at any time
  - This result is not in serialized form, you need to do that yourself if desired
