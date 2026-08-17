import { describe, expect, it } from 'bun:test'
import { resyncScheduleUpdateSchema } from './resync-schedule'

const base = { enabled: true, intervalMinutes: 480, username: 'svc-apic' }
const valid = { ...base, password: 'hunter22' }

describe('resyncScheduleUpdateSchema', () => {
  it('allows password to be omitted', () => {
    expect(resyncScheduleUpdateSchema.safeParse(base).success).toBe(true)
  })

  it('treats an empty password as omitted', () => {
    const parsed = resyncScheduleUpdateSchema.parse({ ...valid, password: '' })
    expect(parsed.password).toBeUndefined()
  })

  it('still validates the interval', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, intervalMinutes: 1 }).success).toBe(false)
  })

  it('rejects an interval below the floor', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, intervalMinutes: 14 }).success).toBe(false)
  })

  it('accepts exactly the floor', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, intervalMinutes: 15 }).success).toBe(true)
  })

  it('accepts exactly the ceiling', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, intervalMinutes: 10080 }).success).toBe(true)
  })

  it('rejects an interval above the ceiling', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, intervalMinutes: 10081 }).success).toBe(false)
  })

  it('rejects a non-integer interval', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, intervalMinutes: 20.5 }).success).toBe(false)
  })

  it('rejects a blank username', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, username: '   ' }).success).toBe(false)
  })

  it('trims the username', () => {
    const parsed = resyncScheduleUpdateSchema.parse({ ...valid, username: '  svc-apic  ' })
    expect(parsed.username).toBe('svc-apic')
  })
})
