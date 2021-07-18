import { waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient } from '../../core'
import { useIsMutating } from '../useIsMutating'
import { useMutation } from '../useMutation'
import { renderWithClient, setActTimeout, sleep } from './utils'

describe('useIsMutating', () => {
  it('should return the number of fetching mutations', async () => {
    const isMutatings: number[] = []
    const queryClient = new QueryClient()

    function IsMutating() {
      const isMutating = useIsMutating()
      isMutatings.push(isMutating)
      return null
    }

    function Page() {
      const { mutate: mutate1 } = useMutation('mutation1', async () => {
        await sleep(150)
        return 'data'
      })
      const { mutate: mutate2 } = useMutation('mutation2', async () => {
        await sleep(50)
        return 'data'
      })

      React.useEffect(() => {
        mutate1()
        setActTimeout(() => {
          mutate2()
        }, 50)
      }, [mutate1, mutate2])

      return <IsMutating />
    }

    renderWithClient(queryClient, <Page />)
    await waitFor(() => expect(isMutatings).toEqual([0, 1, 1, 2, 2, 1, 0]))
  })

  it('should filter correctly by mutationKey', async () => {
    const isMutatings: number[] = []
    const queryClient = new QueryClient()

    function IsMutating() {
      const isMutating = useIsMutating('mutation1')
      isMutatings.push(isMutating)
      return null
    }

    function Page() {
      const { mutate: mutate1 } = useMutation('mutation1', async () => {
        await sleep(100)
        return 'data'
      })
      const { mutate: mutate2 } = useMutation('mutation2', async () => {
        await sleep(100)
        return 'data'
      })

      React.useEffect(() => {
        mutate1()
        mutate2()
      }, [mutate1, mutate2])

      return <IsMutating />
    }

    renderWithClient(queryClient, <Page />)
    await waitFor(() => expect(isMutatings).toEqual([0, 1, 1, 1, 0, 0]))
  })

  it('should filter correctly by predicate', async () => {
    const isMutatings: number[] = []
    const queryClient = new QueryClient()

    function IsMutating() {
      const isMutating = useIsMutating({
        predicate: mutation => mutation.options.mutationKey === 'mutation1',
      })
      isMutatings.push(isMutating)
      return null
    }

    function Page() {
      const { mutate: mutate1 } = useMutation('mutation1', async () => {
        await sleep(100)
        return 'data'
      })
      const { mutate: mutate2 } = useMutation('mutation2', async () => {
        await sleep(100)
        return 'data'
      })

      React.useEffect(() => {
        mutate1()
        mutate2()
      }, [mutate1, mutate2])

      return <IsMutating />
    }

    renderWithClient(queryClient, <Page />)
    await waitFor(() => expect(isMutatings).toEqual([0, 1, 1, 1, 0, 0]))
  })
})
