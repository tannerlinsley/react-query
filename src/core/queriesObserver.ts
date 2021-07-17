import { difference, replaceAt } from './utils'
import { notifyManager } from './notifyManager'
import type { QueryObserverOptions, QueryObserverResult } from './types'
import type { QueryClient } from './queryClient'
import { NotifyOptions, QueryObserver } from './queryObserver'
import { Subscribable } from './subscribable'

type QueriesObserverListener = (result: QueryObserverResult[]) => void

export class QueriesObserver extends Subscribable<QueriesObserverListener> {
  private client: QueryClient
  private result: QueryObserverResult[]
  private queries: QueryObserverOptions[]
  private observers: QueryObserver[]
  private observersMap: Record<string, QueryObserver>

  constructor(client: QueryClient, queries?: QueryObserverOptions[]) {
    super()

    this.client = client
    this.queries = []
    this.result = []
    this.observers = []
    this.observersMap = {}

    if (queries) {
      this.setQueries(queries)
    }
  }

  protected onSubscribe(): void {
    if (this.listeners.length === 1) {
      this.observers.forEach(observer => {
        observer.subscribe(result => {
          this.onUpdate(observer, result)
        })
      })
    }
  }

  protected onUnsubscribe(): void {
    if (!this.listeners.length) {
      this.destroy()
    }
  }

  destroy(): void {
    this.listeners = []
    this.observers.forEach(observer => {
      observer.destroy()
    })
  }

  setQueries(
    queries: QueryObserverOptions[],
    notifyOptions?: NotifyOptions
  ): void {
    this.queries = queries
    this.updateObservers(notifyOptions)
  }

  getCurrentResult(): QueryObserverResult[] {
    return this.result
  }

  getOptimisticResult(queries: QueryObserverOptions[]): QueryObserverResult[] {
    return queries.map((options, index) => {
      const defaultedOptions = this.client.defaultQueryObserverOptions(options)
      return this.getObserver(defaultedOptions, index).getOptimisticResult(
        defaultedOptions
      )
    })
  }

  private getObserver(
    options: QueryObserverOptions,
    index: number
  ): QueryObserver {
    const defaultedOptions = this.client.defaultQueryObserverOptions(options)
    let currentObserver = this.observersMap[defaultedOptions.queryHash!]
    if (!currentObserver && defaultedOptions.keepPreviousData) {
      currentObserver = this.observers[index]
    }
    return currentObserver ?? new QueryObserver(this.client, defaultedOptions)
  }

  private updateObservers(notifyOptions?: NotifyOptions): void {
    notifyManager.batch(() => {
      let hasIndexChange = false

      const prevObservers = this.observers
      const prevOberversMap = this.observersMap

      const newResult: QueryObserverResult[] = []
      const newObservers: QueryObserver[] = []
      const newObserversMap: Record<string, QueryObserver> = {}

      this.queries.forEach((options, i) => {
        const defaultedOptions = this.client.defaultQueryObserverOptions(
          options
        )
        const queryHash = defaultedOptions.queryHash!
        const observer = this.getObserver(defaultedOptions, i)

        if (prevOberversMap[queryHash] || defaultedOptions.keepPreviousData) {
          observer.setOptions(defaultedOptions, notifyOptions)
        }

        if (observer !== prevObservers[i]) {
          hasIndexChange = true
        }

        newObservers.push(observer)
        newResult.push(observer.getCurrentResult())
        newObserversMap[queryHash] = observer
      })

      if (prevObservers.length === newObservers.length && !hasIndexChange) {
        return
      }

      this.observers = newObservers
      this.observersMap = newObserversMap
      this.result = newResult

      if (!this.hasListeners()) {
        return
      }

      difference(prevObservers, newObservers).forEach(observer => {
        observer.destroy()
      })

      difference(newObservers, prevObservers).forEach(observer => {
        observer.subscribe(result => {
          this.onUpdate(observer, result)
        })
      })

      this.notify()
    })
  }

  private onUpdate(observer: QueryObserver, result: QueryObserverResult): void {
    const index = this.observers.indexOf(observer)
    if (index !== -1) {
      this.result = replaceAt(this.result, index, result)
      this.notify()
    }
  }

  private notify(): void {
    notifyManager.batch(() => {
      this.listeners.forEach(listener => {
        listener(this.result)
      })
    })
  }
}
