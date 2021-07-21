---
id: caching
title: Caching Examples
---

> Please thoroughly read the [Important Defaults](./important-defaults) before reading this guide

## Basic Example

This caching example illustrates the story and lifecycle of:

- Query Instances with and without cache data
- Background Refetching
- Inactive Queries
- Garbage Collection

Let's assume we are using the default `cacheTime` of **5 minutes** and the default `staleTime` of `0`.

- A new instance of `useQuery('todos', fetchTodos)` mounts.
  - Since no other queries have been made with this query + variable combination, this query will show a hard loading state and make a network request to fetch the data.
  - It will then cache the data using `'todos'` and `fetchTodos` as the unique identifiers for that cache.
  - The hook will mark itself as stale after the configured `staleTime` (defaults to `0`, or immediately).
- A second instance of `useQuery('todos', fetchTodos)` mounts elsewhere.
  - Because this exact data exists in the cache from the first instance of this query, that data is immediately returned from the cache.
- A background refetch is triggered for both queries (but only one request), since a new instance appeared on screen.
  - Both instances are updated with the new data if the fetch is successful
- Both instances of the `useQuery('todos', fetchTodos)` query are unmounted and no longer in use.
  - Since there are no more active instances of this query, a cache timeout is set using `cacheTime` to delete and garbage collect the query (defaults to **5 minutes**).
- Before the cache timeout has completed another instance of `useQuery('todos', fetchTodos)` mounts. The query immediately returns the available cached value while the `fetchTodos` function is being run in the background to populate the query with a fresh value.
- The final instance of `useQuery('todos', fetchTodos)` unmounts.
- No more instances of `useQuery('todos', fetchTodos)` appear within **5 minutes**.
  - This query and its data are deleted and garbage collected.
