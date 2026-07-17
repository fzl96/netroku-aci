import { apicFetch, type ApicRequestInit } from './client'
import { runParallel } from './parallel'

export type ApicGetResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }

export type ApicFetcher = (
  host: string,
  path: string,
  init?: ApicRequestInit,
) => Promise<Response>

export interface ApicReader {
  get<T>(path: string): Promise<ApicGetResult<T>>
  getMany<T>(paths: Iterable<string>): Promise<Map<string, ApicGetResult<T>>>
}

export function createApicReader(
  host: string,
  token: string,
  fetcher: ApicFetcher = apicFetch,
): ApicReader {
  const reads = new Map<string, Promise<ApicGetResult<unknown>>>()

  function get<T>(path: string): Promise<ApicGetResult<T>> {
    const cached = reads.get(path)
    if (cached) return cached as Promise<ApicGetResult<T>>

    const pending: Promise<ApicGetResult<unknown>> = (async () => {
      try {
        const response = await fetcher(host, path, { token })
        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            error: (await response.text()).slice(0, 200),
          }
        }
        return {
          ok: true,
          status: response.status,
          data: await response.json(),
        }
      } catch (error) {
        reads.delete(path)
        return {
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : 'Network error',
        }
      }
    })()

    reads.set(path, pending)
    return pending as Promise<ApicGetResult<T>>
  }

  async function getMany<T>(paths: Iterable<string>): Promise<Map<string, ApicGetResult<T>>> {
    const uniquePaths = Array.from(new Set(paths))
    const entries = await runParallel(uniquePaths, 10, async path => (
      [path, await get<T>(path)] as const
    ))
    return new Map(entries)
  }

  return { get, getMany }
}
