import { describe, expect, it } from 'bun:test'
import { buildScheduledResyncAudit } from './resync-audit'
import { readResyncGroup } from '@/lib/history/resync-group'

const host = { hostName: 'DRC-SURABAYA', host: '10.221.251.51' }
const result = {
  apicHostId: 'site-1',
  host: host.hostName,
  endpoints: { synced: 10, total: 20 },
  interfaces: { synced: 30, total: 40 },
  nodes: { synced: 3, total: 8 },
  epgs: { synced: 5, total: 17 },
}

describe('scheduled site history', () => {
  it('combines datasets in one audit while preserving static binding and component counts', () => {
    const audit = buildScheduledResyncAudit(host, result)
    expect(audit).toMatchObject({
      action: 'resync.schedule.run',
      target: 'DRC-SURABAYA (10.221.251.51)',
      status: 'success',
    })
    const group = readResyncGroup(audit.payload)!
    expect(group.entries).toHaveLength(4)
    expect(group.entries.find((entry) => entry.id === 'epgs')?.detail).toBe(
      'synced 5 EPGs, 12 static port bindings',
    )
    expect(group.entries.find((entry) => entry.id === 'nodes')?.detail).toBe(
      'synced 3 nodes, 5 components',
    )
  })

  it('keeps failed steps in a partial run and reports all-failed runs as failures', () => {
    const audit = buildScheduledResyncAudit(host, { ...result, epgs: { error: 'APIC offline' } })
    expect(audit.status).toBe('partial')
    expect(readResyncGroup(audit.payload)?.entries.at(-1)).toMatchObject({
      action: 'resync.epgs',
      status: 'failure',
      detail: 'APIC offline',
    })
    expect(
      buildScheduledResyncAudit(host, {
        apicHostId: 'site-1',
        host: host.hostName,
        endpoints: { error: 'offline' },
      }).status,
    ).toBe('failure')
  })

  it('retains credential and finalization failures within the same entry', () => {
    const audit = buildScheduledResyncAudit(
      host,
      { apicHostId: 'site-1', host: host.hostName, error: 'Credential decryption failed' },
      'Failed to finalize schedule',
    )
    expect(audit.status).toBe('failure')
    expect(readResyncGroup(audit.payload)?.entries.map((entry) => entry.detail)).toEqual([
      'Credential decryption failed',
      'Failed to finalize schedule',
    ])
    expect(
      readResyncGroup(
        buildScheduledResyncAudit(host, result, 'Failed to finalize schedule').payload,
      )?.entries,
    ).toHaveLength(5)
  })
})
