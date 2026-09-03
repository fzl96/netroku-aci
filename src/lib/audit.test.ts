import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))

const { createAuditRecorder } = await import('./audit')

describe('audit history cache invalidation', () => {
  it('invalidates history only after the audit entry is durable', async () => {
    const createAuditLog = mock(async () => undefined)
    const revalidateTag = mock(() => undefined)
    const reportError = mock(() => undefined)
    const recordAudit = createAuditRecorder({ createAuditLog, revalidateTag, reportError })

    await recordAudit({ userName: 'operator', action: 'resync.nodes' })

    expect(createAuditLog).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith('history:all', { expire: 0 })
    expect(reportError).not.toHaveBeenCalled()
  })

  it('does not invalidate when audit persistence fails', async () => {
    const createAuditLog = mock(async () => { throw new Error('database unavailable') })
    const revalidateTag = mock(() => undefined)
    const reportError = mock(() => undefined)
    const recordAudit = createAuditRecorder({ createAuditLog, revalidateTag, reportError })

    await expect(recordAudit({ userName: 'operator', action: 'resync.nodes' })).resolves.toBeUndefined()

    expect(revalidateTag).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})
