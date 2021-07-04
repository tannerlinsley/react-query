import React from 'react'
import {
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import { QueryClient, QueryCache, useQuery } from '../..'
import { getByTextContent, renderWithClient, sleep } from './utils'

describe('ReactQueryDevtools', () => {
  const queryCache = new QueryCache()
  const queryClient = new QueryClient({
    queryCache,
    defaultOptions: {
      queries: {
        staleTime: 0,
      },
    },
  })

  beforeEach(() => {
    queryCache.clear()
  })

  it('should be able to open and close devtools', async () => {
    function Page() {
      const { data = 'default' } = useQuery('check', async () => {
        await sleep(10)
        return 'test'
      })

      return (
        <div>
          <h1>{data}</h1>
        </div>
      )
    }

    renderWithClient(queryClient, <Page />, { initialIsOpen: false })

    // Since the initial is open state is false, expect the close button to not be present
    // in the DOM. Then find the open button and click on it.
    const closeButton = screen.queryByRole('button', {
      name: /close react query devtools/i,
    })
    expect(closeButton).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: /open react query devtools/i })
    )

    // Wait for the animation to finish and the open button to be removed from DOM once the devtools
    // is opened. Then find the close button and click on it.
    await waitForElementToBeRemoved(() =>
      screen.queryByRole('button', { name: /open react query devtools/i })
    )
    fireEvent.click(
      screen.getByRole('button', { name: /close react query devtools/i })
    )

    // Finally once the close animation is completed expect the open button to
    // be present in the DOM again.
    await screen.findByRole('button', { name: /open react query devtools/i })
  })

  it('should display the correct query states', async () => {
    function Page() {
      const { data = 'default' } = useQuery(
        'check',
        async () => {
          await sleep(100)
          return 'test'
        },
        { staleTime: 300 }
      )

      return (
        <div>
          <h1>{data}</h1>
        </div>
      )
    }

    function PageParent() {
      const [isPageVisible, setIsPageVisible] = React.useState(true)

      return (
        <div>
          <button
            type="button"
            aria-label="Toggle page visibility"
            onClick={() => setIsPageVisible(visible => !visible)}
          >
            Toggle Page
          </button>
          {isPageVisible && <Page />}
        </div>
      )
    }

    renderWithClient(queryClient, <PageParent />)

    fireEvent.click(
      screen.getByRole('button', { name: /open react query devtools/i })
    )

    // Find the current query from the cache
    const currentQuery = queryCache.find('check')

    // When the query is fetching then expect number of
    // fetching queries to be 1
    expect(currentQuery?.isFetching()).toEqual(true)
    await screen.findByText(
      getByTextContent('fresh (0) fetching (1) stale (0) inactive (0)')
    )

    // When we are done fetching the query doesn't go stale
    // until 300ms after, so expect the number of fresh
    // queries to be 1
    await waitFor(() => {
      expect(currentQuery?.isFetching()).toEqual(false)
    })
    await screen.findByText(
      getByTextContent('fresh (1) fetching (0) stale (0) inactive (0)')
    )

    // Then wait for the query to go stale and then
    // expect the number of stale queries to be 1
    await waitFor(() => {
      expect(currentQuery?.isStale()).toEqual(false)
    })
    await screen.findByText(
      getByTextContent('fresh (0) fetching (0) stale (1) inactive (0)')
    )

    // Unmount the page component thus making the query inactive
    // and expect number of inactive queries to be 1
    fireEvent.click(
      screen.getByRole('button', { name: /toggle page visibility/i })
    )
    await screen.findByText(
      getByTextContent('fresh (0) fetching (0) stale (0) inactive (1)')
    )
  })

  it('should display the query hash and open the query details', async () => {
    function Page() {
      const { data = 'default' } = useQuery('check', async () => {
        await sleep(10)
        return 'test'
      })

      return (
        <div>
          <h1>{data}</h1>
        </div>
      )
    }

    renderWithClient(queryClient, <Page />)

    fireEvent.click(
      screen.getByRole('button', { name: /open react query devtools/i })
    )

    // Find the current query from the cache
    const currentQuery = queryCache.find('check')

    // Expect the query hash to be visible with one observer
    await screen.findByText(getByTextContent(`1${currentQuery?.queryHash}`))

    // Open the query details
    fireEvent.click(
      screen.getByRole('button', {
        name: `Open query details for ${currentQuery?.queryHash}`,
      })
    )

    await screen.findByText(/query details/i)
  })

  it('should filter the queries via the query hash', async () => {
    function Page() {
      const fooResult = useQuery('foo', async () => {
        await sleep(10)
        return 'foo-result'
      })

      const barResult = useQuery('bar', async () => {
        await sleep(10)
        return 'bar-result'
      })

      const bazResult = useQuery('baz', async () => {
        await sleep(10)
        return 'baz-result'
      })

      return (
        <div>
          <h1>
            {barResult.data} {fooResult.data} {bazResult.data}
          </h1>
        </div>
      )
    }

    renderWithClient(queryClient, <Page />)

    fireEvent.click(
      screen.getByRole('button', { name: /open react query devtools/i })
    )

    const fooQuery = queryCache.find('foo')
    const barQuery = queryCache.find('bar')
    const bazQuery = queryCache.find('baz')

    // First check that all the querie hash are visible in list
    await screen.findByText(fooQuery?.queryHash ?? 'invalid hash')
    screen.getByText(barQuery?.queryHash ?? 'invalid hash')
    screen.getByText(bazQuery?.queryHash ?? 'invalid hash')

    // Search for 'fo' via the filter input
    const filterInput = screen.getByLabelText(/filter by queryhash/i)
    fireEvent.change(filterInput, { target: { value: 'fo' } })

    // Expect only the foo query to be visible, and bar and baz
    // to not be visible
    await screen.findByText(fooQuery?.queryHash ?? 'invalid hash')
    const barItem = screen.queryByText(barQuery?.queryHash ?? 'invalid hash')
    const bazItem = screen.queryByText(bazQuery?.queryHash ?? 'invalid hash')
    expect(barItem).toBeNull()
    expect(bazItem).toBeNull()
  })
})
