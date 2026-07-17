import { describe, expect, it } from 'bun:test'
import { createApicReader } from './read-cache'

describe('createApicReader', () => {
  it('deduplicates concurrent reads for the same APIC path', async () => {
    const calls: string[] = []
    const reader = createApicReader('apic.local', 'token', async (_host, path) => {
      calls.push(path)
      await Promise.resolve()
      return Response.json({ imdata: [{ path }] })
    })

    const [first, second] = await Promise.all([
      reader.get<{ imdata: { path: string }[] }>('/api/node/mo/same.json'),
      reader.get<{ imdata: { path: string }[] }>('/api/node/mo/same.json'),
    ])

    expect(calls).toEqual(['/api/node/mo/same.json'])
    expect(first).toEqual(second)
  })

  it('keeps different APIC paths independent', async () => {
    const calls: string[] = []
    const reader = createApicReader('apic.local', 'token', async (_host, path) => {
      calls.push(path)
      return Response.json({ imdata: [{ path }] })
    })

    await Promise.all([reader.get('/a'), reader.get('/b')])

    expect(calls.sort()).toEqual(['/a', '/b'])
  })

  it('evicts rejected reads so a later access can retry', async () => {
    let attempts = 0
    const reader = createApicReader('apic.local', 'token', async () => {
      attempts++
      if (attempts === 1) throw new Error('socket closed')
      return Response.json({ imdata: [] })
    })

    const failed = await reader.get('/retry')
    const retried = await reader.get<{ imdata: unknown[] }>('/retry')

    expect(failed).toEqual({ ok: false, status: 0, error: 'socket closed' })
    expect(retried).toEqual({ ok: true, status: 200, data: { imdata: [] } })
    expect(attempts).toBe(2)
  })

  it('does not share cached reads between reader instances', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return Response.json({ imdata: [] })
    }

    await createApicReader('apic.local', 'token', fetcher).get('/same')
    await createApicReader('apic.local', 'token', fetcher).get('/same')

    expect(calls).toBe(2)
  })

  it('loads each unique path once through getMany', async () => {
    const calls: string[] = []
    const reader = createApicReader('apic.local', 'token', async (_host, path) => {
      calls.push(path)
      return Response.json({ imdata: [{ path }] })
    })

    const results = await reader.getMany<{ imdata: { path: string }[] }>(['/a', '/a', '/b'])

    expect(calls.sort()).toEqual(['/a', '/b'])
    expect([...results.keys()]).toEqual(['/a', '/b'])
    expect(results.get('/a')).toEqual({
      ok: true,
      status: 200,
      data: { imdata: [{ path: '/a' }] },
    })
  })
})
