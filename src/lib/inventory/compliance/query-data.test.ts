import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { reportWindow, parseReportParams, type ComplianceTarget } from './report'
import type { Policy } from './policy'

class AuthenticationRequiredError extends Error {}
let signedIn = true
let role = 'member'
let policies: Policy[] = []
const configs = [
  {
    id: 'config-device',
    platform: 'iosxe',
    rawConfig: 'hostname test\nntp server 192.0.2.1\ntacacs-server host 192.0.2.2 key SECRET',
  },
  {
    id: 'config-stack',
    platform: 'nxos',
    rawConfig:
      'hostname stack\nntp server 192.0.2.1\naaa group server tacacs+ ISE\n server 192.0.2.2',
  },
]
const collectedAt = new Date('2026-10-13T00:00:00Z')
const metadata = (id: string) => ({ id, platform: 'iosxe', collectedAt })
const allDevices = [
  {
    id: 'device',
    name: 'Standalone',
    deviceStackId: null,
    source: null,
    config: metadata('config-device'),
  },
  { id: 'aci', name: 'ACI leaf', deviceStackId: null, source: { kind: 'ACI' }, config: null },
  {
    id: 'empty',
    name: 'Missing config',
    deviceStackId: null,
    source: { kind: 'LEGACY' },
    config: null,
  },
  { id: 'member-1', name: 'Stack member', deviceStackId: 'stack', source: null, config: null },
]
const stacks = [
  {
    id: 'stack',
    name: 'Switch stack',
    source: { kind: 'LEGACY' },
    config: metadata('config-stack'),
    devices: [
      { id: 'member-1', name: 'Stack member', source: null },
      { id: 'member-2', name: 'Other member', source: null },
    ],
  },
]
let rawReads: string[] = []
let writes = 0
const db = {
  device: {
    findMany: async (args: { where: { deviceStackId: null } }) =>
      allDevices.filter((device) => device.deviceStackId === args.where.deviceStackId),
  },
  deviceStack: { findMany: async () => stacks },
  inventoryConfig: {
    findMany: async (args: { where: { id: { in: string[] } } }) => {
      rawReads = args.where.id.in
      return configs.filter((config) => rawReads.includes(config.id))
    },
  },
  compliancePolicy: {
    findMany: async () => policies,
    upsert: async () => {
      writes++
      return {}
    },
  },
}
const requireSession = async () => {
  if (!signedIn) throw new AuthenticationRequiredError()
  return { id: 'user', userName: 'tester', role }
}
const requireAdmin = async () => {
  const actor = await requireSession()
  if (actor.role !== 'admin') throw new Error('Forbidden')
  return actor
}
mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession, requireAdmin }))
mock.module('@/lib/prisma', () => ({
  prisma: {
    ...db,
    $transaction: (input: ((tx: typeof db) => unknown) | Array<Promise<unknown>>) =>
      typeof input === 'function' ? input(db) : Promise.all(input),
  },
}))
mock.module('@/lib/audit', () => ({ recordAudit: async () => {} }))
mock.module('next/cache', () => ({ revalidatePath: () => {} }))
const { getComplianceReport } = await import('./query')
const { updateCompliancePolicies } = await import('./mutation')

beforeEach(() => {
  signedIn = true
  role = 'member'
  rawReads = []
  writes = 0
  policies = [
    { service: 'ntp', enabled: true, expectedIps: ['192.0.2.1'] },
    { service: 'tacacs', enabled: true, expectedIps: ['192.0.2.2'] },
  ]
})

describe('inventory-wide report', () => {
  it('includes manual and discovered assets, groups stack members and never serializes raw config', async () => {
    const report = await getComplianceReport({ query: '', page: 1 })
    expect(report.total).toBe(4)
    expect(report.rows.find((row) => row.id === 'stack')?.members).toHaveLength(2)
    expect(report.rows.some((row) => row.id === 'member-1')).toBe(false)
    expect(
      report.rows
        .find((row) => row.id === 'device')
        ?.results.every((result) => result.status === 'compliant'),
    ).toBe(true)
    expect(
      report.rows
        .find((row) => row.id === 'empty')
        ?.results.every((result) => result.status === 'unknown'),
    ).toBe(true)
    expect(
      report.rows
        .find((row) => row.id === 'aci')
        ?.results.every((result) => result.status === 'not-evaluated'),
    ).toBe(true)
    expect(report.rows[0].collectedAt).toBeNull()
    expect(JSON.stringify(report)).not.toContain('SECRET')
    expect(JSON.stringify(report)).not.toContain('rawConfig')
    expect(report.isAdmin).toBe(false)
  })

  it('loads only visible configs, searches by member and observes policy edits on the next check', async () => {
    const report = await getComplianceReport({ query: 'Stack member', page: 1 })
    expect(report.rows.map((row) => row.id)).toEqual(['stack'])
    expect(rawReads).toEqual(['config-stack'])
    policies[0].expectedIps = ['192.0.2.3']
    const changed = await getComplianceReport({ query: 'Stack member', page: 1 })
    expect(changed.rows[0].results[0]).toMatchObject({
      status: 'noncompliant',
      missing: ['192.0.2.3'],
      unexpected: ['192.0.2.1'],
    })
  })

  it('skips raw config reads when both checks are disabled', async () => {
    policies = policies.map((policy) => ({ ...policy, enabled: false }))
    await getComplianceReport({ query: '', page: 1 })
    expect(rawReads).toEqual([])
  })

  it('requires a session and clamps out-of-range pages after filtering', async () => {
    signedIn = false
    await expect(getComplianceReport({ query: '', page: 1 })).rejects.toThrow('Unauthorized')
    const targets: ComplianceTarget[] = Array.from({ length: 25 }, (_, index) => ({
      id: `d${index}`,
      kind: 'device',
      name: `Device ${index}`,
      members: [],
      aciLinked: false,
      config: null,
    }))
    expect(reportWindow(targets, { query: '', page: 999 }).targets).toHaveLength(5)
    expect(reportWindow(targets, { query: 'missing', page: 999 })).toMatchObject({
      page: 1,
      total: 0,
    })
    expect(parseReportParams({ page: '-1', q: [' switch ', 'ignored'] })).toEqual({
      page: 1,
      query: 'switch',
    })
  })
})

describe('policy administration', () => {
  it('rejects member writes even with a valid payload', async () => {
    await expect(updateCompliancePolicies(policies)).rejects.toThrow('Forbidden')
    expect(writes).toBe(0)
  })

  it('validates both services before persisting either policy', async () => {
    role = 'admin'
    await expect(updateCompliancePolicies([policies[0], policies[0]])).rejects.toThrow(
      'one NTP and one TACACS',
    )
    await expect(
      updateCompliancePolicies([{ ...policies[0], expectedIps: [] }, policies[1]]),
    ).rejects.toThrow('at least one IPv4')
    expect(writes).toBe(0)
    await updateCompliancePolicies(policies)
    expect(writes).toBe(2)
  })
})
