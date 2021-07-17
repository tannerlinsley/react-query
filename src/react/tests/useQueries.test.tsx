import { fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ErrorBoundary } from 'react-error-boundary'

import { mockConsoleError, queryKey, renderWithClient, sleep } from './utils'
import {
  useQueries,
  QueryClient,
  UseQueryResult,
  QueryCache,
  useQueryErrorResetBoundary,
  useQueryClient,
} from '../..'
import { QueryState } from '../../core/query'

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
            await sleep(7)
            return 2
          },
        },
      ])
      results.push(result)
      return null
    }

    renderWithClient(queryClient, <Page />)

    await sleep(10)

    expect(results.length).toBe(3)
    expect(results[0]).toMatchObject([{ data: undefined }, { data: undefined }])
    expect(results[1]).toMatchObject([{ data: 1 }, { data: undefined }])
    expect(results[2]).toMatchObject([{ data: 1 }, { data: 2 }])
  })

  it('should return the correct states with suspense', async () => {
    const key1 = queryKey()
    const key2 = queryKey()
    const results: (QueryState<unknown, undefined>[] | UseQueryResult[])[] = []

    function Fallback() {
      const qc = useQueryClient()
      const queryStates = [qc.getQueryState(key1)!, qc.getQueryState(key2)!]

      results.push(queryStates)

      return null
    }

    function Page() {
      const result = useQueries([
        {
          queryKey: key1,
          queryFn: async () => {
            await sleep(5)
            return 1
          },
          suspense: true,
        },
        {
          queryKey: key2,
          queryFn: async () => {
            await sleep(7)
            return 2
          },
        },
      ])
      results.push(result)
      return null
    }

    renderWithClient(
      queryClient,
      <React.Suspense fallback={<Fallback />}>
        <Page />
      </React.Suspense>
    )

    await waitFor(() => {
      expect(results[0]).toMatchObject([
        { data: undefined },
        { data: undefined },
      ])
      expect(results[1]).toMatchObject([{ data: 1 }, { data: 2 }])
      expect(results.length).toBe(2)
    })
  })

  it('should retry fetch if the reset error boundary has been reset with global hook', async () => {
    const key1 = queryKey()
    const key2 = queryKey()

    let succeed = false
    const consoleMock = mockConsoleError()

    function Page() {
      const results = useQueries([
        {
          queryKey: key1,
          queryFn: async () => {
            await sleep(5)
            if (!succeed) {
              throw new Error('Suspense Error Bingo')
            } else {
              return 'data1'
            }
          },
          retry: false,
          suspense: true,
        },
        {
          queryKey: key2,
          queryFn: () => 'data2',
          staleTime: Infinity,
        },
      ])

      return (
        <div>
          <div>data1: {results[0]?.data}</div>
          <div>data2: {results[1]?.data}</div>
        </div>
      )
    }

    function App() {
      const { reset } = useQueryErrorResetBoundary()
      return (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ resetErrorBoundary }) => (
            <div>
              <div>error boundary</div>
              <button
                onClick={() => {
                  resetErrorBoundary()
                }}
              >
                retry
              </button>
            </div>
          )}
        >
          <React.Suspense fallback="Loading...">
            <Page />
          </React.Suspense>
        </ErrorBoundary>
      )
    }

    const rendered = renderWithClient(queryClient, <App />)

    await waitFor(() => rendered.getByText('Loading...'))
    await waitFor(() => rendered.getByText('error boundary'))
    await waitFor(() => rendered.getByText('retry'))
    fireEvent.click(rendered.getByText('retry'))
    await waitFor(() => rendered.getByText('error boundary'))
    await waitFor(() => rendered.getByText('retry'))
    succeed = true
    fireEvent.click(rendered.getByText('retry'))
    await waitFor(() => rendered.getByText('data1: data1'))
    await waitFor(() => rendered.getByText('data2: data2'))

    consoleMock.mockRestore()
  })
})
