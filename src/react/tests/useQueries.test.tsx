import { waitFor } from '@testing-library/react'
import React from 'react'

import { queryKey, renderWithClient, setActTimeout, sleep } from './utils'
import { useQueries, QueryClient, UseQueryResult, QueryCache } from '../..'

describe('useQueries', () => {
  const queryCache = new QueryCache()
  const queryClient = new QueryClient({ queryCache })

  it('should return the correct states', async () => {
    const key1 = queryKey()
    const key2 = queryKey()
    const results: UseQueryResult[][] = []

    function Page() {
      const result = useQueries([
        {
          queryKey: key1,
          queryFn: async () => {
            await sleep(5)
            return 1
          },
        },
        {
          queryKey: key2,
          queryFn: async () => {
            await sleep(10)
            return 2
          },
        },
      ])
      results.push(result)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(30)

    expect(results.length).toBe(3)
    expect(results[0]).toMatchObject([{ data: undefined }, { data: undefined }])
    expect(results[1]).toMatchObject([{ data: 1 }, { data: undefined }])
    expect(results[2]).toMatchObject([{ data: 1 }, { data: 2 }])
  })

  it('should keep previous data if amount of queries is the same', async () => {
    const key1 = queryKey()
    const key2 = queryKey()
    const states: UseQueryResult[][] = []

    function Page() {
      const [count, setCount] = React.useState(1)
      const result = useQueries([
        {
          queryKey: [key1, count],
          keepPreviousData: true,
          queryFn: async () => {
            await sleep(5)
            return count * 2
          },
        },
        {
          queryKey: [key2, count],
          keepPreviousData: true,
          queryFn: async () => {
            await sleep(10)
            return count * 5
          },
        },
      ])
      states.push(result)

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(prev => prev + 1)
        }, 20)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(7))

    expect(states[0]).toMatchObject([
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[1]).toMatchObject([
      { status: 'success', data: 2, isPreviousData: false, isFetching: false },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[2]).toMatchObject([
      { status: 'success', data: 2, isPreviousData: false, isFetching: false },
      { status: 'success', data: 5, isPreviousData: false, isFetching: false },
    ])
    expect(states[3]).toMatchObject([
      { status: 'success', data: 2, isPreviousData: true, isFetching: true },
      { status: 'success', data: 5, isPreviousData: true, isFetching: true },
    ])
    expect(states[4]).toMatchObject([
      { status: 'success', data: 2, isPreviousData: true, isFetching: true },
      { status: 'success', data: 5, isPreviousData: true, isFetching: true },
    ])
    expect(states[5]).toMatchObject([
      { status: 'success', data: 4, isPreviousData: false, isFetching: false },
      { status: 'success', data: 5, isPreviousData: true, isFetching: true },
    ])
    expect(states[6]).toMatchObject([
      { status: 'success', data: 4, isPreviousData: false, isFetching: false },
      { status: 'success', data: 10, isPreviousData: false, isFetching: false },
    ])
  })

  it('should keep previous data for variable amounts of useQueries', async () => {
    const key = queryKey()
    const states: UseQueryResult[][] = []

    function Page() {
      const [count, setCount] = React.useState(2)
      const result = useQueries(
        Array.from({ length: count }, (_, i) => ({
          queryKey: [key, count, i + 1],
          keepPreviousData: true,
          queryFn: async () => {
            await sleep(5)
            return (i + 1) * count * 2
          },
        }))
      )

      states.push(result)

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(prev => prev + 1)
        }, 20)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(8))

    expect(states[0]).toMatchObject([
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[1]).toMatchObject([
      { status: 'success', data: 4, isPreviousData: false, isFetching: false },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[2]).toMatchObject([
      { status: 'success', data: 4, isPreviousData: false, isFetching: false },
      { status: 'success', data: 8, isPreviousData: false, isFetching: false },
    ])

    expect(states[3]).toMatchObject([
      { status: 'success', data: 4, isPreviousData: true, isFetching: true },
      { status: 'success', data: 8, isPreviousData: true, isFetching: true },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[4]).toMatchObject([
      { status: 'success', data: 4, isPreviousData: true, isFetching: true },
      { status: 'success', data: 8, isPreviousData: true, isFetching: true },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[5]).toMatchObject([
      { status: 'success', data: 6, isPreviousData: false, isFetching: false },
      { status: 'success', data: 8, isPreviousData: true, isFetching: true },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[6]).toMatchObject([
      { status: 'success', data: 6, isPreviousData: false, isFetching: false },
      { status: 'success', data: 12, isPreviousData: false, isFetching: false },
      {
        status: 'loading',
        data: undefined,
        isPreviousData: false,
        isFetching: true,
      },
    ])
    expect(states[7]).toMatchObject([
      { status: 'success', data: 6, isPreviousData: false, isFetching: false },
      { status: 'success', data: 12, isPreviousData: false, isFetching: false },
      { status: 'success', data: 18, isPreviousData: false, isFetching: false },
    ])
  })
})
