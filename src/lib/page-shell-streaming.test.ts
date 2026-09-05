import { describe, expect, it } from 'bun:test'
import path from 'node:path'

describe('operational shell streaming', () => {
  for (const domain of ['endpoints', 'nodes', 'interface-health']) {
    for (const scenario of [
      'streaming',
      'empty',
      'unauthorized',
      'redirect',
      ...(domain === 'interface-health' ? ['non-crc'] : []),
    ]) {
      it(`${domain}: streams the static shell and preserves ${scenario} behavior`, async () => {
        const process = Bun.spawn(
          [
            Bun.which('bun')!,
            path.join(import.meta.dir, 'test-fixtures/page-shell-streaming.tsx'),
            domain,
            scenario,
          ],
          { stdout: 'pipe', stderr: 'pipe' },
        )
        const [exitCode, stderr] = await Promise.all([
          process.exited,
          new Response(process.stderr).text(),
        ])
        expect(exitCode, stderr).toBe(0)
      })
    }
  }

  it('keeps endpoint filters available when the results query fails', async () => {
    const process = Bun.spawn(
      [
        Bun.which('bun')!,
        path.join(import.meta.dir, 'test-fixtures/page-shell-streaming.tsx'),
        'endpoints',
        'results-error',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const [exitCode, stderr] = await Promise.all([
      process.exited,
      new Response(process.stderr).text(),
    ])
    expect(exitCode, stderr).toBe(0)
  })
})
