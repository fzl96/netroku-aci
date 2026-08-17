import { describe, expect, it } from 'bun:test'
import { toSafeSchedule } from './resync-schedules'

const host = { id: 'host-1', name: 'DC-APIC-01', host: '10.0.0.1' }
const T0 = new Date('2026-08-17T12:00:00.000Z')

const row = {
  id: 'sched-1',
  apicHostId: 'host-1',
  enabled: true,
  intervalMinutes: 480,
  encUsername: 'ENCRYPTED_USERNAME',
  encPassword: 'ENCRYPTED_PASSWORD',
  nextRunAt: new Date('2026-08-17T20:00:00.000Z'),
  lastRunAt: T0,
  lastStatus: 'success',
  lastDetail: 'endpoints: 12',
  runningAt: null,
}

describe('toSafeSchedule', () => {
  it('never exposes the encrypted password or username ciphertext', () => {
    const safe = toSafeSchedule(host, row, () => 'svc-apic')
    const serialized = JSON.stringify(safe)
    expect(serialized).not.toContain('ENCRYPTED_PASSWORD')
    expect(serialized).not.toContain('ENCRYPTED_USERNAME')
    expect(Object.keys(safe)).not.toContain('encPassword')
    expect(Object.keys(safe)).not.toContain('encUsername')
  })

  it('reports hasPassword instead of the password', () => {
    const safe = toSafeSchedule(host, row, () => 'svc-apic')
    expect(safe.hasPassword).toBe(true)
    expect(safe.username).toBe('svc-apic')
  })

  it('marks a running schedule', () => {
    const safe = toSafeSchedule(host, { ...row, runningAt: T0 }, () => 'svc-apic')
    expect(safe.isRunning).toBe(true)
  })

  it('falls back to a placeholder when the username cannot be decrypted', () => {
    const safe = toSafeSchedule(host, row, () => {
      throw new Error('bad key')
    })
    expect(safe.username).toBe('(unreadable)')
    expect(JSON.stringify(safe)).not.toContain('ENCRYPTED_USERNAME')
  })

  it('describes an unscheduled host', () => {
    const safe = toSafeSchedule(host, null, () => 'svc-apic')
    expect(safe.enabled).toBe(false)
    expect(safe.hasPassword).toBe(false)
    expect(safe.nextRunAt).toBeNull()
    expect(safe.hostName).toBe('DC-APIC-01')
  })
})
