type StorageScope = 'tab' | 'browser'
type SelectionStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageAccess = (scope: StorageScope) => SelectionStorage

export type ApicSelection = {
  ready: boolean
  tabId: string | null
  rememberedId: string | null
}

const EMPTY_SELECTION: ApicSelection = { ready: false, tabId: null, rememberedId: null }

/** The URL is authoritative; stale browser IDs never beat a configured host. */
export function resolveApicSelection(
  hostIds: readonly string[],
  explicitId: string | null,
  selection: ApicSelection,
): string | null {
  return (
    [explicitId, selection.tabId, selection.rememberedId].find(
      (id): id is string => !!id && hostIds.includes(id),
    ) ??
    hostIds[0] ??
    null
  )
}

export function apicSelectionUrl(pathname: string, search: string, hostId: string): string {
  const params = new URLSearchParams(search)
  params.set('apic', hostId)
  return `${pathname}?${params}`
}

/** One store per mounted user/tab. Other tabs' storage events never change it. */
export function createApicSelectionStore(
  userId: string,
  storage: StorageAccess = (scope) =>
    scope === 'tab' ? window.sessionStorage : window.localStorage,
) {
  const key = `netroku:apic:${userId}`
  const listeners = new Set<() => void>()
  let snapshot = EMPTY_SELECTION

  function read(scope: StorageScope): string | null {
    try {
      return userId ? storage(scope).getItem(key) : null
    } catch {
      return null
    }
  }

  function getSnapshot(): ApicSelection {
    if (!snapshot.ready) {
      const rememberedId = read('browser')
      snapshot = { ready: true, tabId: read('tab') ?? rememberedId, rememberedId }
    }
    return snapshot
  }

  return {
    getSnapshot,
    getServerSnapshot: () => EMPTY_SELECTION,
    resolve(hostIds: readonly string[], explicitId: string | null, selection = getSnapshot()) {
      // A tab stays on its own valid APIC. If that host was deleted, consult
      // the latest browser preference, including choices made in another tab.
      return resolveApicSelection(hostIds, explicitId, {
        ...selection,
        rememberedId: selection.ready
          ? (read('browser') ?? selection.rememberedId)
          : selection.rememberedId,
      })
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      // Pin the initial browser preference so a reload of a neutral page keeps
      // this tab's APIC even after another tab selects a different one.
      const { tabId } = getSnapshot()
      try {
        if (userId && tabId) storage('tab').setItem(key, tabId)
      } catch {
        // The in-memory snapshot remains isolated from other tabs.
      }
      return () => {
        listeners.delete(listener)
      }
    },
    select(hostId: string) {
      const previous = getSnapshot()
      // Try both independently: blocked persistent storage must not break a tab.
      for (const scope of ['tab', 'browser'] as const) {
        try {
          if (userId) storage(scope).setItem(key, hostId)
        } catch {
          // In-memory selection still works when browser storage is unavailable.
        }
      }
      if (previous.tabId === hostId && previous.rememberedId === hostId) return
      snapshot = { ready: true, tabId: hostId, rememberedId: hostId }
      listeners.forEach((listener) => listener())
    },
  }
}
