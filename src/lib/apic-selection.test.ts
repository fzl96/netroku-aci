import { describe, expect, it } from 'bun:test'
import { apicSelectionUrl, createApicSelectionStore, resolveApicSelection } from './apic-selection'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

const hosts = ['default', 'a', 'b']
const selection = { ready: true, tabId: 'a', rememberedId: 'b' }

describe('APIC selection precedence', () => {
  it('uses an explicit URL before the tab and browser preferences', () => {
    expect(resolveApicSelection(hosts, 'b', selection)).toBe('b')
  })

  it('keeps the current tab when navigating without an APIC or with an invalid ID', () => {
    expect(resolveApicSelection(hosts, null, selection)).toBe('a')
    expect(resolveApicSelection(hosts, 'deleted', selection)).toBe('a')
  })

  it('skips deleted tab and browser preferences before falling back to the default', () => {
    expect(resolveApicSelection(hosts, 'deleted', { ...selection, tabId: 'deleted' })).toBe('b')
    expect(resolveApicSelection(['default'], null, selection)).toBe('default')
    expect(resolveApicSelection([], 'a', selection)).toBeNull()
  })

  it('uses the server-validated host list even if the layout still lists a deleted host', () => {
    expect(resolveApicSelection(['b', 'default'], 'a', selection)).toBe('b')
  })

  it('repairs only the APIC parameter while keeping filters and record selections', () => {
    const result = new URL(
      apicSelectionUrl('/epgs', 'apic=deleted&page=2&selected=web&tenant=T1', 'a b'),
      'http://localhost',
    )
    expect(result.searchParams.get('apic')).toBe('a b')
    expect(result.searchParams.get('page')).toBe('2')
    expect(result.searchParams.get('selected')).toBe('web')
    expect(result.searchParams.get('tenant')).toBe('T1')
  })
})

describe('browser APIC preferences', () => {
  it('survives refreshes and future visits', () => {
    const browser = storage()
    const tab = storage()
    const access = (scope: string) => (scope === 'tab' ? tab : browser)
    const store = createApicSelectionStore('alice', access)
    store.select('a')
    expect(createApicSelectionStore('alice', access).getSnapshot().tabId).toBe('a')
    const freshVisit = createApicSelectionStore('alice', (scope) =>
      scope === 'tab' ? storage() : browser,
    )
    expect(freshVisit.getSnapshot().rememberedId).toBe('a')
  })

  it('keeps tabs independent, including reloads of pages without APIC parameters', () => {
    const browser = storage()
    const firstTab = storage()
    const secondTab = storage()
    const first = createApicSelectionStore('alice', (scope) =>
      scope === 'tab' ? firstTab : browser,
    )
    first.select('a')
    const second = createApicSelectionStore('alice', (scope) =>
      scope === 'tab' ? secondTab : browser,
    )
    second.subscribe(() => {})
    expect(second.getSnapshot().tabId).toBe('a')
    first.select('b')
    expect(second.getSnapshot().tabId).toBe('a')
    const reloaded = createApicSelectionStore('alice', (scope) =>
      scope === 'tab' ? secondTab : browser,
    )
    expect(resolveApicSelection(hosts, null, reloaded.getSnapshot())).toBe('a')
    second.select('a')
    const third = createApicSelectionStore('alice', (scope) =>
      scope === 'tab' ? storage() : browser,
    )
    expect(third.getSnapshot().rememberedId).toBe('a')
  })

  it('isolates accounts using the same browser and tab', () => {
    const browser = storage()
    const tab = storage()
    const access = (scope: string) => (scope === 'tab' ? tab : browser)
    createApicSelectionStore('alice', access).select('a')
    const bob = createApicSelectionStore('bob', access)
    expect(bob.getSnapshot().rememberedId).toBeNull()
    bob.select('b')
    expect(createApicSelectionStore('alice', access).getSnapshot().tabId).toBe('a')
  })

  it('uses the latest remembered host when this tab’s host is deleted', () => {
    const browser = storage()
    const tab = storage()
    const first = createApicSelectionStore('alice', (scope) => (scope === 'tab' ? tab : browser))
    first.select('a')
    const secondTab = storage()
    const second = createApicSelectionStore('alice', (scope) =>
      scope === 'tab' ? secondTab : browser,
    )
    second.select('b')
    expect(first.resolve(hosts, null)).toBe('a')
    expect(first.resolve(['default', 'b'], 'a')).toBe('b')
  })

  it('keeps selection usable if storage reads and writes are blocked', () => {
    const store = createApicSelectionStore('alice', () => {
      throw new Error('Blocked storage')
    })
    expect(store.getSnapshot().rememberedId).toBeNull()
    store.select('b')
    expect(resolveApicSelection(hosts, null, store.getSnapshot())).toBe('b')
  })

  it('retains tab persistence even if localStorage is unavailable', () => {
    const tab = storage()
    const access = (scope: string) => {
      if (scope === 'browser') throw new Error('Blocked localStorage')
      return tab
    }
    createApicSelectionStore('alice', access).select('a')
    expect(createApicSelectionStore('alice', access).getSnapshot().tabId).toBe('a')
  })

  it('notifies subscribers after a selection and provides a stable hydration snapshot', () => {
    const browser = storage()
    const tab = storage()
    const store = createApicSelectionStore('alice', (scope) => (scope === 'tab' ? tab : browser))
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications++
    })
    expect(store.getServerSnapshot().ready).toBe(false)
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot())
    store.select('a')
    expect(notifications).toBe(1)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
    unsubscribe()
    store.select('b')
    expect(notifications).toBe(1)
  })
})
