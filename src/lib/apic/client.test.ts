import { describe, expect, it } from 'bun:test'
import { apicAgent } from './client'

describe('apicAgent', () => {
  it('reuses a bounded pool of HTTPS connections', () => {
    expect(apicAgent.keepAlive).toBe(true)
    expect(apicAgent.maxSockets).toBe(20)
    expect(apicAgent.maxFreeSockets).toBe(10)
    expect(apicAgent.options.keepAliveMsecs).toBe(1_000)
    expect(apicAgent.options.scheduling).toBe('lifo')
    expect(apicAgent.options.rejectUnauthorized).toBe(false)
  })
})
