import { act, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

import {
  expectType,
  queryKey,
  mockVisibilityState,
  mockConsoleError,
  sleep,
  renderWithClient,
  setActTimeout,
  Blink,
} from './utils'
import {
  useQuery,
  QueryClient,
  UseQueryResult,
  QueryCache,
  QueryFunction,
  QueryFunctionContext,
} from '../..'

describe('useQuery', () => {
  const queryCache = new QueryCache()
  const queryClient = new QueryClient({ queryCache })

  it('should return the correct types', () => {
    const key = queryKey()

    // @ts-ignore
    // eslint-disable-next-line
    function Page() {
      // unspecified query function should default to unknown
      const noQueryFn = useQuery(key)
      expectType<unknown>(noQueryFn.data)
      expectType<unknown>(noQueryFn.error)

      // it should infer the result type from the query function
      const fromQueryFn = useQuery(key, () => 'test')
      expectType<string | undefined>(fromQueryFn.data)
      expectType<unknown>(fromQueryFn.error)

      // it should be possible to specify the result type
      const withResult = useQuery<string>(key, () => 'test')
      expectType<string | undefined>(withResult.data)
      expectType<unknown | null>(withResult.error)

      // it should be possible to specify the error type
      const withError = useQuery<string, Error>(key, () => 'test')
      expectType<string | undefined>(withError.data)
      expectType<Error | null>(withError.error)

      // it should provide the result type in the configuration
      useQuery([key], async () => true, {
        onSuccess: data => expectType<boolean>(data),
        onSettled: data => expectType<boolean | undefined>(data),
      })

      // should error when the query function result does not match with the specified type
      // @ts-expect-error
      useQuery<number>(key, () => 'test')

      // it should infer the result type from a generic query function
      function queryFn<T = string>(): Promise<T> {
        return Promise.resolve({} as T)
      }

      const fromGenericQueryFn = useQuery(key, () => queryFn())
      expectType<string | undefined>(fromGenericQueryFn.data)
      expectType<unknown>(fromGenericQueryFn.error)

      const fromGenericOptionsQueryFn = useQuery({
        queryKey: key,
        queryFn: () => queryFn(),
      })
      expectType<string | undefined>(fromGenericOptionsQueryFn.data)
      expectType<unknown>(fromGenericOptionsQueryFn.error)

      type MyData = number
      type MyQueryKey = readonly ['my-data', number]

      const getMyDataArrayKey: QueryFunction<MyData, MyQueryKey> = async ({
        queryKey: [, n],
      }) => {
        return n + 42
      }

      useQuery({
        queryKey: ['my-data', 100],
        queryFn: getMyDataArrayKey,
      })

      const getMyDataStringKey: QueryFunction<MyData, '1'> = async context => {
        expectType<['1']>(context.queryKey)
        return Number(context.queryKey[0]) + 42
      }

      useQuery({
        queryKey: '1',
        queryFn: getMyDataStringKey,
      })
    }
  })

  // See https://github.com/tannerlinsley/react-query/issues/105
  it('should allow to set default data value', async () => {
    const key = queryKey()

    function Page() {
      const { data = 'default' } = useQuery(key, async () => {
        await sleep(10)
        return 'test'
      })

      return (
        <div>
          <h1>{data}</h1>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    rendered.getByText('default')

    await waitFor(() => rendered.getByText('test'))
  })

  it('should return the correct states for a successful query', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery<string, Error>(key, () => 'test')

      states.push(state)

      if (state.isIdle) {
        expectType<undefined>(state.data)
        expectType<null>(state.error)
        return <span>idle</span>
      }

      if (state.isLoading) {
        expectType<undefined>(state.data)
        expectType<null>(state.error)
        return <span>loading</span>
      }

      if (state.isLoadingError) {
        expectType<undefined>(state.data)
        expectType<Error>(state.error)
        return <span>{state.error}</span>
      }

      expectType<string>(state.data)
      expectType<Error | null>(state.error)
      return <span>{state.data}</span>
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states[0]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      errorUpdatedAt: 0,
      failureCount: 0,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isIdle: false,
      isLoading: true,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'loading',
    })

    expect(states[1]).toEqual({
      data: 'test',
      dataUpdatedAt: expect.any(Number),
      error: null,
      errorUpdatedAt: 0,
      failureCount: 0,
      isError: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isIdle: false,
      isLoading: false,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: true,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'success',
    })
  })

  it('should return the correct states for an unsuccessful query', async () => {
    const key = queryKey()
    const consoleMock = mockConsoleError()

    const states: UseQueryResult<undefined, string>[] = []

    function Page() {
      const state = useQuery<string[], string, undefined>(
        key,
        () => Promise.reject('rejected'),
        {
          retry: 1,
          retryDelay: 1,
        }
      )

      states.push(state)

      return (
        <div>
          <h1>Status: {state.status}</h1>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('Status: error'))

    expect(states[0]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      errorUpdatedAt: 0,
      failureCount: 0,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isIdle: false,
      isLoading: true,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'loading',
    })

    expect(states[1]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      errorUpdatedAt: 0,
      failureCount: 1,
      isError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isFetching: true,
      isIdle: false,
      isLoading: true,
      isLoadingError: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'loading',
    })

    expect(states[2]).toEqual({
      data: undefined,
      dataUpdatedAt: 0,
      error: 'rejected',
      errorUpdatedAt: expect.any(Number),
      failureCount: 2,
      isError: true,
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isIdle: false,
      isLoading: false,
      isLoadingError: true,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: true,
      isSuccess: false,
      refetch: expect.any(Function),
      remove: expect.any(Function),
      status: 'error',
    })

    consoleMock.mockRestore()
  })

  it('should set isFetchedAfterMount to true after a query has been fetched', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    await queryClient.prefetchQuery(key, () => 'prefetched')

    function Page() {
      const state = useQuery(key, () => 'data')
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)
    expect(states.length).toBe(2)

    expect(states[0]).toMatchObject({
      data: 'prefetched',
      isFetched: true,
      isFetchedAfterMount: false,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isFetched: true,
      isFetchedAfterMount: true,
    })
  })

  it('should call onSuccess after a query has been fetched', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const onSuccess = jest.fn()

    function Page() {
      const state = useQuery(key, () => 'data', { onSuccess })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)
    expect(states.length).toBe(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith('data')
  })

  it('should call onSuccess after a query has been refetched', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const onSuccess = jest.fn()

    function Page() {
      const state = useQuery(key, () => 'data', { onSuccess })

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 10)
      }, [refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)
    expect(states.length).toBe(4)
    expect(onSuccess).toHaveBeenCalledTimes(2)
  })

  it('should call onSuccess after a disabled query has been fetched', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const onSuccess = jest.fn()

    function Page() {
      const state = useQuery(key, () => 'data', { enabled: false, onSuccess })

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 10)
      }, [refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith('data')
  })

  it('should not call onSuccess if a component has unmounted', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const onSuccess = jest.fn()

    function Page() {
      const [show, setShow] = React.useState(true)

      React.useEffect(() => {
        setShow(false)
      }, [setShow])

      return show ? <Component /> : null
    }

    function Component() {
      const state = useQuery(
        key,
        async () => {
          await sleep(10)
          return 'data'
        },
        { onSuccess }
      )
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)
    expect(states.length).toBe(1)
    expect(onSuccess).toHaveBeenCalledTimes(0)
  })

  it('should call onError after a query has been fetched with an error', async () => {
    const key = queryKey()
    const states: UseQueryResult<unknown>[] = []
    const onError = jest.fn()
    const consoleMock = mockConsoleError()

    function Page() {
      const state = useQuery<unknown>(key, () => Promise.reject('error'), {
        retry: false,
        onError,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)
    expect(states.length).toBe(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('error')
    consoleMock.mockRestore()
  })

  it('should not call onError when receiving a CancelledError', async () => {
    const key = queryKey()
    const onError = jest.fn()
    const consoleMock = mockConsoleError()

    function Page() {
      useQuery<unknown>(
        key,
        async () => {
          await sleep(10)
          return 23
        },
        {
          onError,
        }
      )
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(5)
    await queryClient.cancelQueries(key)
    expect(onError).not.toHaveBeenCalled()
    consoleMock.mockRestore()
  })

  it('should call onSettled after a query has been fetched', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const onSettled = jest.fn()

    function Page() {
      const state = useQuery(key, () => 'data', { onSettled })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)
    expect(states.length).toBe(2)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith('data', null)
  })

  it('should call onSettled after a query has been fetched with an error', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const onSettled = jest.fn()
    const consoleMock = mockConsoleError()

    function Page() {
      const state = useQuery(key, () => Promise.reject('error'), {
        retry: false,
        onSettled,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)
    expect(states.length).toBe(2)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(undefined, 'error')
    consoleMock.mockRestore()
  })

  it('should be able to watch a query without providing a query function', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    queryClient.setQueryDefaults(key, { queryFn: () => 'data' })

    function Page() {
      const state = useQuery<string>(key)
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'data' })
  })

  it('should create a new query when re-mounting with cacheTime 0', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const [toggle, setToggle] = React.useState(false)

      React.useEffect(() => {
        setActTimeout(() => {
          setToggle(true)
        }, 20)
      }, [setToggle])

      return toggle ? <Component key="1" /> : <Component key="2" />
    }

    function Component() {
      const state = useQuery(
        key,
        async () => {
          await sleep(5)
          return 'data'
        },
        {
          cacheTime: 0,
        }
      )
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(5)
    // First load
    expect(states[0]).toMatchObject({ isLoading: true, isSuccess: false })
    // First success
    expect(states[1]).toMatchObject({ isLoading: false, isSuccess: true })
    // Switch
    expect(states[2]).toMatchObject({ isLoading: false, isSuccess: true })
    // Second load
    expect(states[3]).toMatchObject({ isLoading: true, isSuccess: false })
    // Second success
    expect(states[4]).toMatchObject({ isLoading: false, isSuccess: true })
  })

  it('should not get into an infinite loop when removing a query with cacheTime 0 and rerendering', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const [, rerender] = React.useState({})

      const state = useQuery(
        key,
        async () => {
          await sleep(5)
          return 'data'
        },
        {
          cacheTime: 0,
        }
      )

      states.push(state)

      const { remove } = state

      React.useEffect(() => {
        setActTimeout(() => {
          remove()
          rerender({})
        }, 20)
      }, [remove])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(5)
    // First load
    expect(states[0]).toMatchObject({ isLoading: true, isSuccess: false })
    // First success
    expect(states[1]).toMatchObject({ isLoading: false, isSuccess: true })
    // Remove
    expect(states[2]).toMatchObject({ isLoading: true, isSuccess: false })
    // Hook state update
    expect(states[3]).toMatchObject({ isLoading: true, isSuccess: false })
    // Second success
    expect(states[4]).toMatchObject({ isLoading: false, isSuccess: true })
  })

  it('should fetch when refetchOnMount is false and nothing has been fetched yet', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'test', {
        refetchOnMount: false,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should fetch when refetchOnMount is false and data has been fetched already', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    queryClient.setQueryData(key, 'prefetched')

    function Page() {
      const state = useQuery(key, () => 'test', {
        refetchOnMount: false,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(1)
    expect(states[0]).toMatchObject({ data: 'prefetched' })
  })

  it('should be able to select a part of the data with select', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => ({ name: 'test' }), {
        select: data => data.name,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should be able to select a part of the data with select in object syntax', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery({
        queryKey: key,
        queryFn: () => ({ name: 'test' }),
        select: data => data.name,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should not re-render when it should only re-render only data change and the selected data did not change', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => ({ name: 'test' }), {
        select: data => data.name,
        notifyOnChangeProps: ['data'],
      })

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 5)
      }, [refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should throw an error when a selector throws', async () => {
    const consoleMock = mockConsoleError()
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const error = new Error('Select Error')

    function Page() {
      const state = useQuery(key, () => ({ name: 'test' }), {
        select: () => {
          throw error
        },
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(consoleMock).toHaveBeenCalledWith(error)
    expect(states.length).toBe(2)

    expect(states[0]).toMatchObject({ status: 'loading', data: undefined })
    expect(states[1]).toMatchObject({ status: 'error', error })

    consoleMock.mockRestore()
  })

  it('should re-render when dataUpdatedAt changes but data remains the same', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'test', {
        notifyOnChangePropsExclusions: [
          'data',
          'isFetching',
          'isLoading',
          'isRefetching',
          'isSuccess',
          'status',
        ],
      })

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 5)
      }, [refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(3)
    expect(states[0]).toMatchObject({ data: undefined, isFetching: true })
    expect(states[1]).toMatchObject({ data: 'test', isFetching: false })
    expect(states[2]).toMatchObject({ data: 'test', isFetching: false })
    expect(states[1]?.dataUpdatedAt).not.toBe(states[2]?.dataUpdatedAt)
  })

  it('should track properties and only re-render when a tracked property changes', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'test', {
        notifyOnChangeProps: 'tracked',
      })

      states.push(state)

      const { refetch, data } = state

      React.useEffect(() => {
        if (data) {
          refetch()
        }
      }, [refetch, data])

      return (
        <div>
          <h1>{data ?? null}</h1>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('test'))

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should not re-render if a tracked prop changes, but it was excluded', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'test', {
        notifyOnChangeProps: 'tracked',
        notifyOnChangePropsExclusions: ['data'],
      })

      states.push(state)

      return (
        <div>
          <h1>{state.data ?? 'null'}</h1>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('null'))
    expect(states.length).toBe(1)
    expect(states[0]).toMatchObject({ data: undefined })

    await queryClient.refetchQueries(key)
    await waitFor(() => rendered.getByText('null'))
    expect(states.length).toBe(1)
    expect(states[0]).toMatchObject({ data: undefined })
  })

  it('should always re-render if we are tracking props but not using any', async () => {
    const key = queryKey()
    let renderCount = 0
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'test', {
        notifyOnChangeProps: 'tracked',
      })

      states.push(state)

      React.useEffect(() => {
        renderCount++
      }, [state])

      return (
        <div>
          <h1>hello</h1>
        </div>
      )
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)
    expect(renderCount).toBe(2)
    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined })
    expect(states[1]).toMatchObject({ data: 'test' })
  })

  it('should be able to remove a query', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const [, rerender] = React.useState({})
      const state = useQuery(key, () => ++count)

      states.push(state)

      const { remove } = state

      React.useEffect(() => {
        setActTimeout(() => {
          remove()
        }, 5)
        setActTimeout(() => {
          rerender({})
        }, 10)
      }, [remove, rerender])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(20)

    expect(states.length).toBe(5)
    // Initial
    expect(states[0]).toMatchObject({ data: undefined })
    // Fetched
    expect(states[1]).toMatchObject({ data: 1 })
    // Remove
    expect(states[2]).toMatchObject({ data: undefined })
    // Hook state update
    expect(states[3]).toMatchObject({ data: undefined })
    // Fetched
    expect(states[4]).toMatchObject({ data: 2 })
  })

  it('should be create a new query when refetching a removed query', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(key, () => ++count)

      states.push(state)

      const { remove, refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          remove()
        }, 5)
        setActTimeout(() => {
          refetch()
        }, 10)
      }, [remove, refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(20)

    expect(states.length).toBe(4)
    // Initial
    expect(states[0]).toMatchObject({ data: undefined, dataUpdatedAt: 0 })
    // Fetched
    expect(states[1]).toMatchObject({ data: 1 })
    // Switch
    expect(states[2]).toMatchObject({ data: undefined, dataUpdatedAt: 0 })
    // Fetched
    expect(states[3]).toMatchObject({ data: 2 })
  })

  it('should share equal data structures between query results', async () => {
    const key = queryKey()

    const result1 = [
      { id: '1', done: false },
      { id: '2', done: false },
    ]

    const result2 = [
      { id: '1', done: false },
      { id: '2', done: true },
    ]

    const states: UseQueryResult<typeof result1>[] = []

    let count = 0

    function Page() {
      const state = useQuery(key, () => {
        count++
        return count === 1 ? result1 : result2
      })

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 10)
      }, [refetch])
      return null
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(4))

    const todos = states[2]?.data
    const todo1 = todos?.[0]
    const todo2 = todos?.[1]

    const newTodos = states[3]?.data
    const newTodo1 = newTodos?.[0]
    const newTodo2 = newTodos?.[1]

    expect(todos).toEqual(result1)
    expect(newTodos).toEqual(result2)
    expect(newTodos).not.toBe(todos)
    expect(newTodo1).toBe(todo1)
    expect(newTodo2).not.toBe(todo2)

    return null
  })

  it('should use query function from hook when the existing query does not have a query function', async () => {
    const key = queryKey()
    const results: UseQueryResult<string>[] = []

    queryClient.setQueryData(key, 'set')

    function Page() {
      const result = useQuery(
        key,
        async () => {
          await sleep(1)
          return 'fetched'
        },
        { enabled: false }
      )

      results.push(result)

      React.useEffect(() => {
        setActTimeout(() => {
          queryClient.refetchQueries(key)
        }, 10)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)

    expect(results.length).toBe(3)
    expect(results[0]).toMatchObject({ data: 'set', isFetching: false })
    expect(results[1]).toMatchObject({ data: 'set', isFetching: true })
    expect(results[2]).toMatchObject({ data: 'fetched', isFetching: false })
  })

  it('should update query stale state and refetch when invalidated with invalidateQueries', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(
        key,
        async () => {
          await sleep(1)
          count++
          return count
        },
        { staleTime: Infinity }
      )

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          queryClient.invalidateQueries(key)
        }, 10)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(4)
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      isRefetching: false,
      isSuccess: false,
      isStale: true,
    })
    expect(states[1]).toMatchObject({
      data: 1,
      isFetching: false,
      isRefetching: false,
      isSuccess: true,
      isStale: false,
    })
    expect(states[2]).toMatchObject({
      data: 1,
      isFetching: true,
      isRefetching: true,
      isSuccess: true,
      isStale: true,
    })
    expect(states[3]).toMatchObject({
      data: 2,
      isFetching: false,
      isRefetching: false,
      isSuccess: true,
      isStale: false,
    })
  })

  it('should update disabled query when updated with invalidateQueries', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(
        key,
        async () => {
          await sleep(10)
          count++
          return count
        },
        { enabled: false }
      )

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          queryClient.refetchQueries({ queryKey: key })
        }, 20)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(3)
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isStale: true,
    })
    expect(states[1]).toMatchObject({
      data: undefined,
      isFetching: true,
      isSuccess: false,
      isStale: true,
    })
    expect(states[2]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isStale: true,
    })
  })

  it('should not refetch disabled query when invalidated with invalidateQueries', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(
        key,
        async () => {
          await sleep(10)
          count++
          return count
        },
        { enabled: false }
      )

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          queryClient.invalidateQueries(key)
        }, 20)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(1)
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isStale: true,
    })
  })

  it('should not fetch when switching to a disabled query', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []

    function Page() {
      const [count, setCount] = React.useState(0)

      const state = useQuery(
        [key, count],
        async () => {
          await sleep(5)
          return count
        },
        { enabled: count === 0 }
      )

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(1)
        }, 10)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)

    expect(states.length).toBe(3)

    // Fetch query
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      isSuccess: false,
    })
    // Fetched query
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
    })
    // Switch to disabled query
    expect(states[2]).toMatchObject({
      data: undefined,
      isFetching: false,
      isSuccess: false,
    })
  })

  it('should keep the previous data when keepPreviousData is set', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []

    function Page() {
      const [count, setCount] = React.useState(0)

      const state = useQuery(
        [key, count],
        async () => {
          await sleep(10)
          return count
        },
        { keepPreviousData: true }
      )

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(1)
        }, 20)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(5))

    // Initial
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      isSuccess: false,
      isPreviousData: false,
    })
    // Fetched
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
    // Set state
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPreviousData: true,
    })
    // Hook state update
    expect(states[3]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPreviousData: true,
    })
    // New data
    expect(states[4]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
  })

  it('should transition to error state when keepPreviousData is set', async () => {
    const key = queryKey()
    const consoleMock = mockConsoleError()
    const states: UseQueryResult<number>[] = []

    function Page({ count }: { count: number }) {
      const state = useQuery<number, Error>(
        [key, count],
        async () => {
          if (count === 2) {
            throw new Error('Error test')
          }
          return Promise.resolve(count)
        },
        {
          retry: false,
          keepPreviousData: true,
        }
      )

      states.push(state)

      return (
        <div>
          <h1>data: {state.data}</h1>
          <h2>error: {state.error?.message}</h2>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page count={0} />)
    await waitFor(() => rendered.getByText('data: 0'))
    act(() => rendered.rerender(<Page count={1} />))
    await waitFor(() => rendered.getByText('data: 1'))
    act(() => rendered.rerender(<Page count={2} />))
    await waitFor(() => rendered.getByText('error: Error test'))

    expect(states.length).toBe(8)
    // Initial
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: true,
      status: 'loading',
      error: null,
      isPreviousData: false,
    })
    // Fetched
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      status: 'success',
      error: null,
      isPreviousData: false,
    })
    // rerender Page 1
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: true,
      status: 'success',
      error: null,
      isPreviousData: true,
    })
    // Hook state update
    expect(states[3]).toMatchObject({
      data: 0,
      isFetching: true,
      status: 'success',
      error: null,
      isPreviousData: true,
    })
    // New data
    expect(states[4]).toMatchObject({
      data: 1,
      isFetching: false,
      status: 'success',
      error: null,
      isPreviousData: false,
    })
    // rerender Page 2
    expect(states[5]).toMatchObject({
      data: 1,
      isFetching: true,
      status: 'success',
      error: null,
      isPreviousData: true,
    })
    // Hook state update again
    expect(states[6]).toMatchObject({
      data: 1,
      isFetching: true,
      status: 'success',
      error: null,
      isPreviousData: true,
    })
    // Error
    expect(states[7]).toMatchObject({
      data: undefined,
      isFetching: false,
      status: 'error',
      isPreviousData: false,
    })
    expect(states[7]?.error).toHaveProperty('message', 'Error test')

    consoleMock.mockRestore()
  })

  it('should not show initial data from next query if keepPreviousData is set', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []

    function Page() {
      const [count, setCount] = React.useState(0)

      const state = useQuery(
        [key, count],
        async () => {
          await sleep(10)
          return count
        },
        { initialData: 99, keepPreviousData: true }
      )

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(1)
        }, 20)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(5))

    // Initial
    expect(states[0]).toMatchObject({
      data: 99,
      isFetching: true,
      isSuccess: true,
      isPreviousData: false,
    })
    // Fetched
    expect(states[1]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
    // Set state
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPreviousData: true,
    })
    // Hook state update
    expect(states[3]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPreviousData: true,
    })
    // New data
    expect(states[4]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
  })

  it('should keep the previous data on disabled query when keepPreviousData is set', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []

    function Page() {
      const [count, setCount] = React.useState(0)

      const state = useQuery(
        [key, count],
        async () => {
          await sleep(10)
          return count
        },
        { enabled: false, keepPreviousData: true }
      )

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        refetch()

        setActTimeout(() => {
          setCount(1)
        }, 20)

        setActTimeout(() => {
          refetch()
        }, 30)
      }, [refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(6)

    // Disabled query
    expect(states[0]).toMatchObject({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isPreviousData: false,
    })
    // Fetching query
    expect(states[1]).toMatchObject({
      data: undefined,
      isFetching: true,
      isSuccess: false,
      isPreviousData: false,
    })
    // Fetched query
    expect(states[2]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
    // Set state
    expect(states[3]).toMatchObject({
      data: 0,
      isFetching: false,
      isSuccess: true,
      isPreviousData: true,
    })
    // Fetching new query
    expect(states[4]).toMatchObject({
      data: 0,
      isFetching: true,
      isSuccess: true,
      isPreviousData: true,
    })
    // Fetched new query
    expect(states[5]).toMatchObject({
      data: 1,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
  })

  it('should keep the previous data on disabled query when keepPreviousData is set and switching query key multiple times', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []

    queryClient.setQueryData([key, 10], 10)

    await sleep(10)

    function Page() {
      const [count, setCount] = React.useState(10)

      const state = useQuery(
        [key, count],
        async () => {
          await sleep(10)
          return count
        },
        { enabled: false, keepPreviousData: true }
      )

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(11)
        }, 20)
        setActTimeout(() => {
          setCount(12)
        }, 30)
        setActTimeout(() => {
          refetch()
        }, 40)
      }, [refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(5)

    // Disabled query
    expect(states[0]).toMatchObject({
      data: 10,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
    // Set state
    expect(states[1]).toMatchObject({
      data: 10,
      isFetching: false,
      isSuccess: true,
      isPreviousData: true,
    })
    // State update
    expect(states[2]).toMatchObject({
      data: 10,
      isFetching: false,
      isSuccess: true,
      isPreviousData: true,
    })
    // Refetch
    expect(states[3]).toMatchObject({
      data: 10,
      isFetching: true,
      isSuccess: true,
      isPreviousData: true,
    })
    // Refetch done
    expect(states[4]).toMatchObject({
      data: 12,
      isFetching: false,
      isSuccess: true,
      isPreviousData: false,
    })
  })

  it('should use the correct query function when components use different configurations', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []

    function FirstComponent() {
      const state = useQuery(key, () => 1)
      const refetch = state.refetch

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 10)
      }, [refetch])

      return null
    }

    function SecondComponent() {
      useQuery(key, () => 2)
      return null
    }

    function Page() {
      return (
        <>
          <FirstComponent />
          <SecondComponent />
        </>
      )
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(4))

    expect(states[0]).toMatchObject({
      data: undefined,
    })
    expect(states[1]).toMatchObject({
      data: 1,
    })
    expect(states[2]).toMatchObject({
      data: 1,
    })
    // This state should be 1 instead of 2
    expect(states[3]).toMatchObject({
      data: 1,
    })
  })

  it('should be able to set different stale times for a query', async () => {
    const key = queryKey()
    const states1: UseQueryResult<string>[] = []
    const states2: UseQueryResult<string>[] = []

    await queryClient.prefetchQuery(key, () => 'prefetch')

    await sleep(20)

    function FirstComponent() {
      const state = useQuery(key, () => 'one', {
        staleTime: 100,
      })
      states1.push(state)
      return null
    }

    function SecondComponent() {
      const state = useQuery(key, () => 'two', {
        staleTime: 10,
      })
      states2.push(state)
      return null
    }

    function Page() {
      return (
        <>
          <FirstComponent />
          <SecondComponent />
        </>
      )
    }

    renderWithClient(queryClient, <Page />)

    await sleep(200)

    expect(states1.length).toBe(4)
    expect(states2.length).toBe(3)

    expect(states1).toMatchObject([
      // First render
      {
        data: 'prefetch',
        isStale: false,
      },
      // Second useQuery started fetching
      {
        data: 'prefetch',
        isStale: false,
      },
      // Second useQuery data came in
      {
        data: 'two',
        isStale: false,
      },
      // Data became stale after 100ms
      {
        data: 'two',
        isStale: true,
      },
    ])

    expect(states2).toMatchObject([
      // First render, data is stale and starts fetching
      {
        data: 'prefetch',
        isStale: true,
      },
      // Second useQuery data came in
      {
        data: 'two',
        isStale: false,
      },
      // Data became stale after 5ms
      {
        data: 'two',
        isStale: true,
      },
    ])
  })

  it('should re-render when a query becomes stale', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'test', {
        staleTime: 50,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(3)
    expect(states[0]).toMatchObject({ isStale: true })
    expect(states[1]).toMatchObject({ isStale: false })
    expect(states[2]).toMatchObject({ isStale: true })
  })

  it('should notify query cache when a query becomes stale', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const fn = jest.fn()

    const unsubscribe = queryCache.subscribe(fn)

    function Page() {
      const state = useQuery(key, () => 'test', {
        staleTime: 10,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(20)
    unsubscribe()

    // 1. Subscribe observer
    // 2. Query loading
    // 3. Observer loading
    // 4. Query success
    // 5. Observer success
    // 6. Query stale
    // 7. Unsubscribe observer
    expect(fn).toHaveBeenCalledTimes(7)
  })

  it('should not re-render when it should only re-render on data changes and the data did not change', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(
        key,
        async () => {
          await sleep(5)
          return 'test'
        },
        {
          notifyOnChangeProps: ['data'],
        }
      )

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 10)
      }, [refetch])
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(30)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({
      data: undefined,
      status: 'loading',
      isFetching: true,
    })
    expect(states[1]).toMatchObject({
      data: 'test',
      status: 'success',
      isFetching: false,
    })
  })

  // See https://github.com/tannerlinsley/react-query/issues/137
  it('should not override initial data in dependent queries', async () => {
    const key1 = queryKey()
    const key2 = queryKey()

    function Page() {
      const first = useQuery(key1, () => 'data', {
        enabled: false,
        initialData: 'init',
      })

      const second = useQuery(key2, () => 'data', {
        enabled: false,
        initialData: 'init',
      })

      return (
        <div>
          <h2>First Data: {first.data}</h2>
          <h2>Second Data: {second.data}</h2>
          <div>First Status: {first.status}</div>
          <div>Second Status: {second.status}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    rendered.getByText('First Data: init')
    rendered.getByText('Second Data: init')
    rendered.getByText('First Status: success')
    rendered.getByText('Second Status: success')
  })

  it('should not override query configuration on render', async () => {
    const key = queryKey()

    const queryFn1 = async () => {
      await sleep(10)
      return 'data1'
    }

    const queryFn2 = async () => {
      await sleep(10)
      return 'data2'
    }

    function Page() {
      useQuery(key, queryFn1)
      useQuery(key, queryFn2)
      return null
    }

    renderWithClient(queryClient, <Page />)

    expect(queryCache.find(key)!.options.queryFn).toBe(queryFn1)
  })

  it('should render correct states even in case of useEffect triggering delays', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    const originalUseEffect = React.useEffect

    // Try to simulate useEffect timing delay
    React.useEffect = (...args: any[]) => {
      originalUseEffect(() => {
        setTimeout(() => {
          args[0]()
        }, 10)
      }, args[1])
    }

    function Page() {
      const state = useQuery(key, () => 'data', { staleTime: Infinity })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)
    queryClient.setQueryData(key, 'data')
    await sleep(50)

    React.useEffect = originalUseEffect

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ status: 'loading' })
    expect(states[1]).toMatchObject({ status: 'success' })
  })

  it('should render correct states even in case of concurrent renders with different properties', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let concurrent = false
    const originalUseEffect = React.useEffect
    const dummyUseEffect = (...args: any[]) => {
      originalUseEffect(() => {
        return
      }, args[1])
    }

    function Page() {
      const [count, setCount] = React.useState(0)

      if (concurrent) {
        React.useEffect = dummyUseEffect
      }

      const state = useQuery(
        [key, count],
        async () => {
          await sleep(5)
          return count
        },
        { staleTime: Infinity, keepPreviousData: true }
      )

      if (concurrent) {
        React.useEffect = originalUseEffect
      }

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(1)
        }, 20)

        // Try to simulate concurrent render which does not trigger effects
        setActTimeout(() => {
          concurrent = true
          setCount(0)
        }, 40)

        setActTimeout(() => {
          concurrent = false
          setCount(2)
        }, 60)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(9)

    // Load query 0
    expect(states[0]).toMatchObject({
      status: 'loading',
      data: undefined,
      isFetching: true,
      isPreviousData: false,
    })
    // Fetch done
    expect(states[1]).toMatchObject({
      status: 'success',
      data: 0,
      isFetching: false,
      isPreviousData: false,
    })
    // Set state to query 1
    expect(states[2]).toMatchObject({
      status: 'success',
      data: 0,
      isFetching: true,
      isPreviousData: true,
    })
    // Fetch start
    expect(states[3]).toMatchObject({
      status: 'success',
      data: 0,
      isFetching: true,
      isPreviousData: true,
    })
    // Fetch done
    expect(states[4]).toMatchObject({
      status: 'success',
      data: 1,
      isFetching: false,
      isPreviousData: false,
    })
    // Concurrent render for query 0
    expect(states[5]).toMatchObject({
      status: 'success',
      data: 0,
      isFetching: false,
      isPreviousData: false,
    })
    // Set state to query 2 (should have query 1 has previous data)
    expect(states[6]).toMatchObject({
      status: 'success',
      data: 1,
      isFetching: true,
      isPreviousData: true,
    })
    // Fetch start
    expect(states[7]).toMatchObject({
      status: 'success',
      data: 1,
      isFetching: true,
      isPreviousData: true,
    })
    // Fetch done
    expect(states[8]).toMatchObject({
      status: 'success',
      data: 2,
      isFetching: false,
      isPreviousData: false,
    })
  })

  it('should batch re-renders', async () => {
    const key = queryKey()

    let renders = 0

    const queryFn = async () => {
      await sleep(10)
      return 'data'
    }

    function Page() {
      useQuery(key, queryFn)
      useQuery(key, queryFn)
      renders++
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(20)

    // Should be 2 instead of 3
    expect(renders).toBe(2)
  })

  it('should batch re-renders including hook callbacks', async () => {
    const key = queryKey()

    let renders = 0
    let renderedCount = 0

    const queryFn = async () => {
      await sleep(10)
      return 'data'
    }

    function Page() {
      const [count, setCount] = React.useState(0)
      useQuery(key, queryFn, {
        onSuccess: () => {
          setCount(x => x + 1)
        },
      })
      useQuery(key, queryFn, {
        onSuccess: () => {
          setCount(x => x + 1)
        },
      })
      renders++
      renderedCount = count
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(20)

    // Should be 2 instead of 5
    expect(renders).toBe(2)

    // Both callbacks should have been executed
    expect(renderedCount).toBe(2)
  })

  it('should render latest data even if react has discarded certain renders', async () => {
    const key = queryKey()

    function Page() {
      const [, setNewState] = React.useState('state')
      const state = useQuery(key, () => 'data')
      React.useEffect(() => {
        setActTimeout(() => {
          queryClient.setQueryData(key, 'new')
          // Update with same state to make react discard the next render
          setNewState('state')
        }, 10)
      }, [])
      return <div>{state.data}</div>
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('new'))
  })

  // See https://github.com/tannerlinsley/react-query/issues/170
  it('should start with status idle if enabled is false', async () => {
    const key1 = queryKey()
    const key2 = queryKey()

    function Page() {
      const first = useQuery(key1, () => 'data', {
        enabled: false,
      })
      const second = useQuery(key2, () => 'data')

      return (
        <div>
          <div>First Status: {first.status}</div>
          <div>Second Status: {second.status}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    // use "act" to wait for state update and prevent console warning

    rendered.getByText('First Status: idle')
    await waitFor(() => rendered.getByText('Second Status: loading'))
    await waitFor(() => rendered.getByText('Second Status: success'))
  })

  // See https://github.com/tannerlinsley/react-query/issues/144
  it('should be in "loading" state by default', async () => {
    const key = queryKey()

    function Page() {
      const { status } = useQuery(key, async () => {
        await sleep(10)
        return 'test'
      })

      return <div>status: {status}</div>
    }

    const rendered = renderWithClient(queryClient, <Page />)

    rendered.getByText('status: loading')
  })

  // See https://github.com/tannerlinsley/react-query/issues/147
  it('should not pass stringified variables to query function', async () => {
    const key = queryKey()
    const variables = { number: 5, boolean: false, object: {}, array: [] }
    type QueryKey = [string, typeof variables]
    const states: UseQueryResult<QueryKey>[] = []

    const queryFn = async (ctx: QueryFunctionContext<QueryKey>) => {
      await sleep(10)
      return ctx.queryKey
    }

    function Page() {
      const state = useQuery([key, variables], queryFn)
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(20)

    expect(states[1]?.data).toEqual([key, variables])
  })

  it('should not refetch query on focus when `enabled` is set to `false`', async () => {
    const key = queryKey()
    const queryFn = jest.fn()

    function Page() {
      const { data = 'default' } = useQuery(key, queryFn, {
        enabled: false,
      })

      return (
        <div>
          <h1>{data}</h1>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('default'))

    act(() => {
      window.dispatchEvent(new FocusEvent('focus'))
    })

    expect(queryFn).not.toHaveBeenCalled()
  })

  it('should not refetch stale query on focus when `refetchOnWindowFocus` is set to `false`', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(key, () => count++, {
        staleTime: 0,
        refetchOnWindowFocus: false,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    act(() => {
      window.dispatchEvent(new FocusEvent('focus'))
    })

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined, isFetching: true })
    expect(states[1]).toMatchObject({ data: 0, isFetching: false })
  })

  it('should not refetch fresh query on focus when `refetchOnWindowFocus` is set to `true`', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(key, () => count++, {
        staleTime: Infinity,
        refetchOnWindowFocus: true,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    act(() => {
      window.dispatchEvent(new FocusEvent('focus'))
    })

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({ data: undefined, isFetching: true })
    expect(states[1]).toMatchObject({ data: 0, isFetching: false })
  })

  it('should refetch fresh query on focus when `refetchOnWindowFocus` is set to `always`', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(
        key,
        async () => {
          await sleep(1)
          return count++
        },
        {
          staleTime: Infinity,
          refetchOnWindowFocus: 'always',
        }
      )
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    act(() => {
      window.dispatchEvent(new FocusEvent('focus'))
    })

    await sleep(10)

    expect(states.length).toBe(4)
    expect(states[0]).toMatchObject({ data: undefined, isFetching: true })
    expect(states[1]).toMatchObject({ data: 0, isFetching: false })
    expect(states[2]).toMatchObject({ data: 0, isFetching: true })
    expect(states[3]).toMatchObject({ data: 1, isFetching: false })
  })

  it('should refetch fresh query when refetchOnMount is set to always', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    await queryClient.prefetchQuery(key, () => 'prefetched')

    function Page() {
      const state = useQuery(key, () => 'data', {
        refetchOnMount: 'always',
        staleTime: Infinity,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({
      data: 'prefetched',
      isStale: false,
      isFetching: true,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isStale: false,
      isFetching: false,
    })
  })

  it('should refetch stale query when refetchOnMount is set to true', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    await queryClient.prefetchQuery(key, () => 'prefetched')

    await sleep(10)

    function Page() {
      const state = useQuery(key, () => 'data', {
        refetchOnMount: true,
        staleTime: 0,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({
      data: 'prefetched',
      isStale: true,
      isFetching: true,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isStale: true,
      isFetching: false,
    })
  })

  it('should set status to error if queryFn throws', async () => {
    const key = queryKey()
    const consoleMock = mockConsoleError()

    function Page() {
      const { status, error } = useQuery<undefined, string>(
        key,
        () => {
          return Promise.reject('Error test jaylen')
        },
        { retry: false }
      )

      return (
        <div>
          <h1>{status}</h1>
          <h2>{error}</h2>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('error'))
    await waitFor(() => rendered.getByText('Error test jaylen'))

    consoleMock.mockRestore()
  })

  it('should always fetch if refetchOnMount is set to always', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    await queryClient.prefetchQuery(key, () => 'prefetched')

    function Page() {
      const state = useQuery(key, () => 'data', {
        refetchOnMount: 'always',
        staleTime: 50,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)
    expect(states.length).toBe(3)
    expect(states[0]).toMatchObject({
      data: 'prefetched',
      isStale: false,
      isFetching: true,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isStale: false,
      isFetching: false,
    })
    expect(states[2]).toMatchObject({
      data: 'data',
      isStale: true,
      isFetching: false,
    })
  })

  it('should fetch if initial data is set', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'data', {
        initialData: 'initial',
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)

    expect(states.length).toBe(2)

    expect(states[0]).toMatchObject({
      data: 'initial',
      isStale: true,
      isFetching: true,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isStale: true,
      isFetching: false,
    })
  })

  it('should not fetch if initial data is set with a stale time', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'data', {
        staleTime: 50,
        initialData: 'initial',
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({
      data: 'initial',
      isStale: false,
      isFetching: false,
    })
    expect(states[1]).toMatchObject({
      data: 'initial',
      isStale: true,
      isFetching: false,
    })
  })

  it('should fetch if initial data updated at is older than stale time', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    const oneSecondAgo = Date.now() - 1000

    function Page() {
      const state = useQuery(key, () => 'data', {
        staleTime: 50,
        initialData: 'initial',
        initialDataUpdatedAt: oneSecondAgo,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(3)
    expect(states[0]).toMatchObject({
      data: 'initial',
      isStale: true,
      isFetching: true,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isStale: false,
      isFetching: false,
    })
    expect(states[2]).toMatchObject({
      data: 'data',
      isStale: true,
      isFetching: false,
    })
  })

  it('should fetch if "initial data updated at" is exactly 0', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key, () => 'data', {
        staleTime: 10 * 1000, // 10 seconds
        initialData: 'initial',
        initialDataUpdatedAt: 0,
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(2)
    expect(states[0]).toMatchObject({
      data: 'initial',
      isStale: true,
      isFetching: true,
    })
    expect(states[1]).toMatchObject({
      data: 'data',
      isStale: false,
      isFetching: false,
    })
  })

  it('should keep initial data when the query key changes', async () => {
    const key = queryKey()
    const states: UseQueryResult<{ count: number }>[] = []

    function Page() {
      const [count, setCount] = React.useState(0)
      const state = useQuery([key, count], () => ({ count: 10 }), {
        staleTime: Infinity,
        initialData: () => ({ count }),
      })
      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          setCount(1)
        }, 10)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(2)
    // Initial
    expect(states[0]).toMatchObject({ data: { count: 0 } })
    // Set state
    expect(states[1]).toMatchObject({ data: { count: 1 } })
  })

  it('should retry specified number of times', async () => {
    const key = queryKey()
    const consoleMock = mockConsoleError()

    const queryFn = jest.fn()
    queryFn.mockImplementation(() => {
      return Promise.reject('Error test Barrett')
    })

    function Page() {
      const { status, failureCount } = useQuery(key, queryFn, {
        retry: 1,
        retryDelay: 1,
      })

      return (
        <div>
          <h1>{status}</h1>
          <h2>Failed {failureCount} times</h2>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('loading'))
    await waitFor(() => rendered.getByText('error'))

    // query should fail `retry + 1` times, since first time isn't a "retry"
    await waitFor(() => rendered.getByText('Failed 2 times'))

    expect(queryFn).toHaveBeenCalledTimes(2)
    consoleMock.mockRestore()
  })

  it('should not retry if retry function `false`', async () => {
    const key = queryKey()

    const consoleMock = mockConsoleError()

    const queryFn = jest.fn()

    queryFn.mockImplementationOnce(() => {
      return Promise.reject('Error test Tanner')
    })

    queryFn.mockImplementation(() => {
      return Promise.reject('NoRetry')
    })

    function Page() {
      const { status, failureCount, error } = useQuery<
        undefined,
        string,
        [string]
      >(key, queryFn, {
        retryDelay: 1,
        retry: (_failureCount, err) => err !== 'NoRetry',
      })

      return (
        <div>
          <h1>{status}</h1>
          <h2>Failed {failureCount} times</h2>
          <h2>{error}</h2>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('loading'))
    await waitFor(() => rendered.getByText('error'))

    await waitFor(() => rendered.getByText('Failed 2 times'))
    await waitFor(() => rendered.getByText('NoRetry'))

    expect(queryFn).toHaveBeenCalledTimes(2)
    consoleMock.mockRestore()
  })

  it('should extract retryDelay from error', async () => {
    const key = queryKey()
    const consoleMock = mockConsoleError()

    type DelayError = { delay: number }

    const queryFn = jest.fn()
    queryFn.mockImplementation(() => {
      return Promise.reject({ delay: 50 })
    })

    function Page() {
      const { status, failureCount } = useQuery(key, queryFn, {
        retry: 1,
        retryDelay: (_, error: DelayError) => error.delay,
      })

      return (
        <div>
          <h1>{status}</h1>
          <h2>Failed {failureCount} times</h2>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(queryFn).toHaveBeenCalledTimes(1)

    await waitFor(() => rendered.getByText('Failed 2 times'))

    expect(queryFn).toHaveBeenCalledTimes(2)
    consoleMock.mockRestore()
  })

  // See https://github.com/tannerlinsley/react-query/issues/160
  it('should continue retry after focus regain', async () => {
    const key = queryKey()

    const consoleMock = mockConsoleError()

    const originalVisibilityState = document.visibilityState

    // make page unfocused
    mockVisibilityState('hidden')

    let count = 0

    function Page() {
      const query = useQuery(
        key,
        () => {
          count++
          return Promise.reject(`fetching error ${count}`)
        },
        {
          retry: 3,
          retryDelay: 1,
        }
      )

      return (
        <div>
          <div>error {String(query.error)}</div>
          <div>status {query.status}</div>
          <div>failureCount {query.failureCount}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    // The query should display the first error result
    await waitFor(() => rendered.getByText('failureCount 1'))
    await waitFor(() => rendered.getByText('status loading'))
    await waitFor(() => rendered.getByText('error null'))

    // Check if the query really paused
    await sleep(10)
    await waitFor(() => rendered.getByText('failureCount 1'))

    act(() => {
      // reset visibilityState to original value
      mockVisibilityState(originalVisibilityState)
      window.dispatchEvent(new FocusEvent('focus'))
    })

    // Wait for the final result
    await waitFor(() => rendered.getByText('failureCount 4'))
    await waitFor(() => rendered.getByText('status error'))
    await waitFor(() => rendered.getByText('error fetching error 4'))

    // Check if the query really stopped
    await sleep(10)
    await waitFor(() => rendered.getByText('failureCount 4'))

    // Check if the error has been logged in the console
    expect(consoleMock).toHaveBeenCalledWith('fetching error 4')

    consoleMock.mockRestore()
  })

  it('should fetch on mount when a query was already created with setQueryData', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    queryClient.setQueryData(key, 'prefetched')

    function Page() {
      const state = useQuery(key, () => 'data')
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(states.length).toBe(2)
    expect(states).toMatchObject([
      {
        data: 'prefetched',
        isFetching: true,
        isStale: true,
      },
      {
        data: 'data',
        isFetching: false,
        isStale: true,
      },
    ])
  })

  it('should refetch after focus regain', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []
    const consoleMock = mockConsoleError()

    // make page unfocused
    const originalVisibilityState = document.visibilityState
    mockVisibilityState('hidden')

    // set data in cache to check if the hook query fn is actually called
    queryClient.setQueryData(key, 'prefetched')

    function Page() {
      const state = useQuery(key, async () => {
        await sleep(1)
        return 'data'
      })
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(2))

    act(() => {
      // reset visibilityState to original value
      mockVisibilityState(originalVisibilityState)
      window.dispatchEvent(new FocusEvent('focus'))
    })

    await waitFor(() => expect(states.length).toBe(4))

    expect(states).toMatchObject([
      {
        data: 'prefetched',
        isFetching: true,
        isStale: true,
      },
      {
        data: 'data',
        isFetching: false,
        isStale: true,
      },
      {
        data: 'data',
        isFetching: true,
        isStale: true,
      },
      {
        data: 'data',
        isFetching: false,
        isStale: true,
      },
    ])

    consoleMock.mockRestore()
  })

  // See https://github.com/tannerlinsley/react-query/issues/195
  it('should refetch if stale after a prefetch', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    const queryFn = jest.fn()
    queryFn.mockImplementation(() => 'data')

    const prefetchQueryFn = jest.fn()
    prefetchQueryFn.mockImplementation(() => 'not yet...')

    await queryClient.prefetchQuery(key, prefetchQueryFn, {
      staleTime: 10,
    })

    await sleep(11)

    function Page() {
      const state = useQuery(key, queryFn)
      states.push(state)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await waitFor(() => expect(states.length).toBe(2))

    expect(prefetchQueryFn).toHaveBeenCalledTimes(1)
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('should not refetch if not stale after a prefetch', async () => {
    const key = queryKey()

    const queryFn = jest.fn()
    queryFn.mockImplementation(() => 'data')

    const prefetchQueryFn = jest.fn()
    prefetchQueryFn.mockImplementation(async () => {
      await sleep(10)
      return 'not yet...'
    })

    await queryClient.prefetchQuery(key, prefetchQueryFn, {
      staleTime: 1000,
    })

    await sleep(0)

    function Page() {
      useQuery(key, queryFn, {
        staleTime: 1000,
      })
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(0)

    expect(prefetchQueryFn).toHaveBeenCalledTimes(1)
    expect(queryFn).toHaveBeenCalledTimes(0)
  })

  // See https://github.com/tannerlinsley/react-query/issues/190
  it('should reset failureCount on successful fetch', async () => {
    const key = queryKey()

    const consoleMock = mockConsoleError()

    function Page() {
      let counter = 0

      const query = useQuery(
        key,
        async () => {
          if (counter < 2) {
            counter++
            throw new Error('error')
          } else {
            return 'data'
          }
        },
        { retryDelay: 10 }
      )

      return (
        <div>
          <div>failureCount {query.failureCount}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('failureCount 2'))
    await waitFor(() => rendered.getByText('failureCount 0'))

    consoleMock.mockRestore()
  })

  // See https://github.com/tannerlinsley/react-query/issues/199
  it('should use prefetched data for dependent query', async () => {
    const key = queryKey()

    function Page() {
      const [enabled, setEnabled] = React.useState(false)
      const [isPrefetched, setPrefetched] = React.useState(false)

      const query = useQuery(key, () => undefined, {
        enabled,
      })

      React.useEffect(() => {
        async function prefetch() {
          await queryClient.prefetchQuery(key, () =>
            Promise.resolve('prefetched data')
          )
          setPrefetched(true)
        }
        prefetch()
      }, [])

      return (
        <div>
          {isPrefetched && <div>isPrefetched</div>}
          <button onClick={() => setEnabled(true)}>setKey</button>
          <div>{query.data}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)
    await waitFor(() => rendered.getByText('isPrefetched'))

    fireEvent.click(rendered.getByText('setKey'))
    await waitFor(() => rendered.getByText('prefetched data'))
  })

  it('should support dependent queries via the enable config option', async () => {
    const key = queryKey()

    function Page() {
      const [shouldFetch, setShouldFetch] = React.useState(false)

      const query = useQuery(key, () => 'data', {
        enabled: shouldFetch,
      })

      return (
        <div>
          <div>Status: {query.status}</div>
          <h2>Data: {query.data || 'no data'}</h2>
          {query.isStale ? (
            <button onClick={() => setShouldFetch(true)}>fetch</button>
          ) : null}
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    rendered.getByText('Status: idle')
    rendered.getByText('Data: no data')

    fireEvent.click(rendered.getByText('fetch'))

    await waitFor(() => rendered.getByText('Status: loading'))
    await waitFor(() => [
      rendered.getByText('Status: success'),
      rendered.getByText('Data: data'),
    ])
  })

  it('should mark query as fetching, when using initialData', async () => {
    const key = queryKey()
    const results: UseQueryResult<string>[] = []

    function Page() {
      const result = useQuery(key, () => 'serverData', { initialData: 'data' })
      results.push(result)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(results.length).toBe(2)
    expect(results[0]).toMatchObject({ data: 'data', isFetching: true })
    expect(results[1]).toMatchObject({ data: 'serverData', isFetching: false })
  })

  it('should initialize state properly, when initialData is falsy', async () => {
    const key = queryKey()
    const results: UseQueryResult<number>[] = []

    function Page() {
      const result = useQuery(key, () => 1, { initialData: 0 })
      results.push(result)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(results.length).toBe(2)
    expect(results[0]).toMatchObject({ data: 0, isFetching: true })
    expect(results[1]).toMatchObject({ data: 1, isFetching: false })
  })

  // // See https://github.com/tannerlinsley/react-query/issues/214
  it('data should persist when enabled is changed to false', async () => {
    const key = queryKey()
    const results: UseQueryResult<string>[] = []

    function Page() {
      const [shouldFetch, setShouldFetch] = React.useState(true)

      const result = useQuery(key, () => 'fetched data', {
        enabled: shouldFetch,
        initialData: shouldFetch ? 'initial' : 'initial falsy',
      })

      results.push(result)

      React.useEffect(() => {
        setActTimeout(() => {
          setShouldFetch(false)
        }, 5)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(50)
    expect(results.length).toBe(3)
    expect(results[0]).toMatchObject({ data: 'initial', isStale: true })
    expect(results[1]).toMatchObject({ data: 'fetched data', isStale: true })
    expect(results[2]).toMatchObject({ data: 'fetched data', isStale: true })
  })

  it('it should support enabled:false in query object syntax', async () => {
    const key = queryKey()
    const queryFn = jest.fn()
    queryFn.mockImplementation(() => 'data')

    function Page() {
      const { status } = useQuery({
        queryKey: key,
        queryFn,
        enabled: false,
      })
      return <div>status: {status}</div>
    }

    const rendered = renderWithClient(queryClient, <Page />)

    expect(queryFn).not.toHaveBeenCalled()
    expect(queryCache.find(key)).not.toBeUndefined()
    rendered.getByText('status: idle')
  })

  // See https://github.com/tannerlinsley/react-query/issues/360
  test('should init to status:idle when enabled is falsey', async () => {
    const key = queryKey()

    function Page() {
      const query = useQuery(key, () => undefined, {
        enabled: false,
      })

      return (
        <div>
          <div>status: {query.status}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('status: idle'))
  })

  test('should not schedule garbage collection, if cacheTimeout is set to `Infinity`', async () => {
    const key = queryKey()

    function Page() {
      const query = useQuery(key, () => 'fetched data', {
        cacheTime: Infinity,
      })
      return <div>{query.data}</div>
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('fetched data'))

    rendered.unmount()

    const query = queryCache.find(key)
    // @ts-expect-error
    expect(query!.cacheTimeout).toBe(undefined)
  })

  it('should not cause memo churn when data does not change', async () => {
    const key = queryKey()
    const queryFn = jest.fn()
    const memoFn = jest.fn()

    function Page() {
      const result = useQuery(key, async () => {
        await sleep(10)
        return (
          queryFn() || {
            data: {
              nested: true,
            },
          }
        )
      })

      React.useMemo(() => {
        memoFn()
        return result.data
      }, [result.data])

      return (
        <div>
          <div>status {result.status}</div>
          <div>isFetching {result.isFetching ? 'true' : 'false'}</div>
          <button onClick={() => result.refetch()}>refetch</button>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('status loading'))
    await waitFor(() => rendered.getByText('status success'))
    fireEvent.click(rendered.getByText('refetch'))
    await waitFor(() => rendered.getByText('isFetching true'))
    await waitFor(() => rendered.getByText('isFetching false'))
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(memoFn).toHaveBeenCalledTimes(2)
  })

  it('should update data upon interval changes', async () => {
    const key = queryKey()
    let count = 0

    function Page() {
      const [int, setInt] = React.useState(200)
      const { data } = useQuery(key, () => count++, {
        refetchInterval: int,
      })

      React.useEffect(() => {
        if (data === 2) {
          setInt(0)
        }
      }, [data])

      return <div>count: {data}</div>
    }

    const rendered = renderWithClient(queryClient, <Page />)

    // mount
    await waitFor(() => rendered.getByText('count: 0'))
    await waitFor(() => rendered.getByText('count: 1'))
    await waitFor(() => rendered.getByText('count: 2'))
  })

  it('should accept an empty string as query key', async () => {
    function Page() {
      const result = useQuery('', ctx => ctx.queryKey)
      return <>{JSON.stringify(result.data)}</>
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText(''))
  })

  it('should accept an object as query key', async () => {
    function Page() {
      const result = useQuery([{ a: 'a' }], ctx => ctx.queryKey)
      return <>{JSON.stringify(result.data)}</>
    }

    const rendered = renderWithClient(queryClient, <Page />)

    await waitFor(() => rendered.getByText('[{"a":"a"}]'))
  })

  it('should refetch if any query instance becomes enabled', async () => {
    const key = queryKey()

    const queryFn = jest.fn().mockReturnValue('data')

    function Disabled() {
      useQuery(key, queryFn, { enabled: false })
      return null
    }

    function Page() {
      const [enabled, setEnabled] = React.useState(false)
      const result = useQuery(key, queryFn, { enabled })
      return (
        <>
          <Disabled />
          <div>{result.data}</div>
          <button onClick={() => setEnabled(true)}>enable</button>
        </>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)
    expect(queryFn).toHaveBeenCalledTimes(0)
    fireEvent.click(rendered.getByText('enable'))
    await waitFor(() => rendered.getByText('data'))
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('should use placeholder data while the query loads', async () => {
    const key1 = queryKey()

    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key1, () => 'data', {
        placeholderData: 'placeholder',
      })

      states.push(state)

      return (
        <div>
          <h2>Data: {state.data}</h2>
          <div>Status: {state.status}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)
    await waitFor(() => rendered.getByText('Data: data'))

    expect(states).toMatchObject([
      {
        isSuccess: true,
        isPlaceholderData: true,
        data: 'placeholder',
      },
      {
        isSuccess: true,
        isPlaceholderData: false,
        data: 'data',
      },
    ])
  })

  it('placeholder data should run through select', async () => {
    const key1 = queryKey()

    const states: UseQueryResult<string>[] = []

    function Page() {
      const state = useQuery(key1, () => 1, {
        placeholderData: 23,
        select: data => String(data * 2),
      })

      states.push(state)

      return (
        <div>
          <h2>Data: {state.data}</h2>
          <div>Status: {state.status}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)
    await waitFor(() => rendered.getByText('Data: 2'))

    expect(states).toMatchObject([
      {
        isSuccess: true,
        isPlaceholderData: true,
        data: '46',
      },
      {
        isSuccess: true,
        isPlaceholderData: false,
        data: '2',
      },
    ])
  })

  it('placeholder data function result should run through select', async () => {
    const key1 = queryKey()

    const states: UseQueryResult<string>[] = []
    let placeholderFunctionRunCount = 0

    function Page() {
      const state = useQuery(key1, () => 1, {
        placeholderData: () => {
          placeholderFunctionRunCount++
          return 23
        },
        select: data => String(data * 2),
      })

      states.push(state)

      return (
        <div>
          <h2>Data: {state.data}</h2>
          <div>Status: {state.status}</div>
        </div>
      )
    }

    const rendered = renderWithClient(queryClient, <Page />)
    await waitFor(() => rendered.getByText('Data: 2'))

    rendered.rerender(<Page />)

    expect(states).toMatchObject([
      {
        isSuccess: true,
        isPlaceholderData: true,
        data: '46',
      },
      {
        isSuccess: true,
        isPlaceholderData: false,
        data: '2',
      },
      {
        isSuccess: true,
        isPlaceholderData: false,
        data: '2',
      },
    ])

    expect(placeholderFunctionRunCount).toEqual(1)
  })

  it('should cancel the query function when there are no more subscriptions', async () => {
    const key = queryKey()
    let cancelFn: jest.Mock = jest.fn()

    const queryFn = () => {
      const promise = new Promise<string>((resolve, reject) => {
        cancelFn = jest.fn(() => reject('Cancelled'))
        sleep(10).then(() => resolve('OK'))
      })

      ;(promise as any).cancel = cancelFn

      return promise
    }

    function Page() {
      const state = useQuery(key, queryFn)
      return (
        <div>
          <h1>Status: {state.status}</h1>
        </div>
      )
    }

    const rendered = renderWithClient(
      queryClient,
      <Blink duration={5}>
        <Page />
      </Blink>
    )

    await waitFor(() => rendered.getByText('off'))

    expect(cancelFn).toHaveBeenCalled()
  })

  it('should refetch when quickly switching to a failed query', async () => {
    const key = queryKey()
    const states: UseQueryResult<string>[] = []

    const queryFn = () => {
      let cancelFn = jest.fn()

      const promise = new Promise<string>((resolve, reject) => {
        cancelFn = jest.fn(() => reject('Cancelled'))
        sleep(50).then(() => resolve('OK'))
      })

      ;(promise as any).cancel = cancelFn

      return promise
    }

    function Page() {
      const [id, setId] = React.useState(1)
      const [hasChanged, setHasChanged] = React.useState(false)

      const state = useQuery([key, id], queryFn)

      states.push(state)

      React.useEffect(() => {
        setId(prevId => (prevId === 1 ? 2 : 1))
        setHasChanged(true)
      }, [hasChanged])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)
    expect(states.length).toBe(4)
    // Load query 1
    expect(states[0]).toMatchObject({
      status: 'loading',
      error: null,
    })
    // Load query 2
    expect(states[1]).toMatchObject({
      status: 'loading',
      error: null,
    })
    // Load query 1
    expect(states[2]).toMatchObject({
      status: 'loading',
      error: null,
    })
    // Loaded query 1
    expect(states[3]).toMatchObject({
      status: 'success',
      error: null,
    })
  })

  it('should update query state and refetch when reset with resetQueries', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(
        key,
        async () => {
          await sleep(1)
          count++
          return count
        },
        { staleTime: Infinity }
      )

      states.push(state)

      React.useEffect(() => {
        setActTimeout(() => {
          queryClient.resetQueries(key)
        }, 10)
      }, [])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(4)
    expect(states[0]).toMatchObject({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isSuccess: false,
      isStale: true,
    })
    expect(states[1]).toMatchObject({
      data: 1,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isStale: false,
    })
    expect(states[2]).toMatchObject({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isSuccess: false,
      isStale: true,
    })
    expect(states[3]).toMatchObject({
      data: 2,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isStale: false,
    })
  })

  it('should update query state and not refetch when resetting a disabled query with resetQueries', async () => {
    const key = queryKey()
    const states: UseQueryResult<number>[] = []
    let count = 0

    function Page() {
      const state = useQuery(
        key,
        () => {
          count++
          return count
        },
        { staleTime: Infinity, enabled: false }
      )

      states.push(state)

      const { refetch } = state

      React.useEffect(() => {
        setActTimeout(() => {
          refetch()
        }, 0)
        setActTimeout(() => {
          queryClient.resetQueries(key)
        }, 50)
      }, [refetch])

      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(100)

    expect(states.length).toBe(4)
    expect(states[0]).toMatchObject({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isSuccess: false,
      isStale: true,
    })
    expect(states[1]).toMatchObject({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isSuccess: false,
      isStale: true,
    })
    expect(states[2]).toMatchObject({
      data: 1,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isStale: false,
    })
    expect(states[3]).toMatchObject({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isSuccess: false,
      isStale: true,
    })
  })

  it('should only call the query hash function once each render', async () => {
    const key = queryKey()

    let hashes = 0
    let renders = 0

    function queryKeyHashFn(x: any) {
      hashes++
      return JSON.stringify(x)
    }

    function Page() {
      renders++
      useQuery(key, () => 'test', { queryKeyHashFn })
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(renders).toBe(2)
    expect(hashes).toBe(2)
  })
})
