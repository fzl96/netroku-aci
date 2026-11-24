import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const fixture = mkdtempSync(join(root, '.font-build-check-'))
const require = createRequire(import.meta.url)

// Exercise the actual production font definitions through a minimal Next build.
// This valid Google Fonts response reproduces the upstream query-parser bug;
// local fonts must build without ever consuming it or fetching from Google.
try {
  mkdirSync(join(fixture, 'app'))
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ private: true }))
  writeFileSync(
    join(fixture, 'next.config.js'),
    `module.exports = { turbopack: { root: ${JSON.stringify(root)} } }`,
  )
  writeFileSync(
    join(fixture, 'app', 'layout.js'),
    `
    import { inter, lora } from '../../src/lib/fonts'
    export default function Layout({ children }) {
      return <html className={inter.variable + ' ' + lora.variable}><body>{children}</body></html>
    }
  `,
  )
  writeFileSync(
    join(fixture, 'app', 'page.js'),
    'export default function Page() { return <main>Font build check</main> }',
  )
  const css = (family: string) =>
    `/* latin */\n@font-face { font-family: '${family}'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/l/font?kit=fixture&skey=fixture&v=v1) format('woff2'); }`
  const mockPath = join(fixture, 'google-responses.cjs')
  writeFileSync(
    mockPath,
    `module.exports = ${JSON.stringify({
      'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap': css('Inter'),
      'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap': css('Lora'),
    })}`,
  )
  const result = spawnSync(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'build', fixture],
    {
      cwd: root,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockPath,
      },
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr)
    process.exitCode = 1
  } else {
    const fonts = readdirSync(join(fixture, '.next', 'static', 'media')).filter((name) =>
      name.endsWith('.woff2'),
    )
    if (fonts.length < 2) throw new Error('Build did not emit both local font assets')
    console.log(
      'Production font definitions build and emit both fonts without Google Fonts requests.',
    )
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
