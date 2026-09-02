import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const FRAMEWORK_ROUTE_FILES = new Set([
  'default.tsx',
  'error.tsx',
  'forbidden.tsx',
  'global-error.tsx',
  'layout.tsx',
  'loading.tsx',
  'not-found.tsx',
  'page.tsx',
  'route.ts',
  'template.tsx',
  'unauthorized.tsx',
])

type ArchitectureFile = {
  path: string
  source: string
  routeImplementation?: boolean
  routeRelativePath?: string
}

type ArchitectureViolation = {
  path: string
  rule: 'direct-prisma' | 'page-action' | 'page-session' | 'route-loading' | 'route-implementation'
}

type MigratedPurpose = {
  name: string
  routes: Array<{
    root: string
    allowedFiles: string[]
  }>
  entryRoots: string[]
}

// Add one purpose only when its vertical slice starts. The slice must restore
// this guard to green before it is committed.
const MIGRATED_PURPOSES: MigratedPurpose[] = [
  {
    name: 'endpoints',
    routes: [{
      root: 'src/app/(app)/endpoints',
      allowedFiles: ['page.tsx'],
    }],
    entryRoots: ['src/app/api/endpoints', 'src/components/endpoints'],
  },
  {
    name: 'epgs',
    routes: [{
      root: 'src/app/(app)/epgs',
      allowedFiles: ['page.tsx'],
    }],
    entryRoots: ['src/app/api/epgs', 'src/components/epgs'],
  },
]

function inspectArchitectureFiles(
  files: ArchitectureFile[],
  allowedRouteFiles: ReadonlySet<string> = FRAMEWORK_ROUTE_FILES,
): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = []

  for (const file of files) {
    const basename = path.basename(file.path)
    // Architecture tests quote the specifiers they forbid. The entry rules describe route,
    // render, action, and route-handler modules, not tests. Placement rules below still
    // apply, so a test colocated in a route directory remains a violation.
    const isTest = /\.test\.tsx?$/.test(basename)

    if (!isTest && file.source.includes('@/lib/prisma')) {
      violations.push({ path: file.path, rule: 'direct-prisma' })
    }
    if (basename === 'page.tsx' && file.source.includes('@/actions/')) {
      violations.push({ path: file.path, rule: 'page-action' })
    }
    if (basename === 'page.tsx' && file.source.includes('getSession')) {
      violations.push({ path: file.path, rule: 'page-session' })
    }
    if (file.routeImplementation && basename === 'loading.tsx') {
      violations.push({ path: file.path, rule: 'route-loading' })
    }
    if (
      file.routeImplementation
      && basename !== 'loading.tsx'
      && !allowedRouteFiles.has(file.routeRelativePath ?? basename)
    ) {
      violations.push({ path: file.path, rule: 'route-implementation' })
    }
  }

  return violations
}

function collectTypeScriptFiles(
  root: string,
  routeImplementation: boolean,
  routeRoot: string = root,
): ArchitectureFile[] {
  const absoluteRoot = path.join(process.cwd(), root)
  if (!existsSync(absoluteRoot)) {
    throw new Error(`Architecture root does not exist: ${root}`)
  }

  const files: ArchitectureFile[] = []
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(relativePath, routeImplementation, routeRoot))
      continue
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue
    files.push({
      path: relativePath,
      source: readFileSync(path.join(process.cwd(), relativePath), 'utf8'),
      routeImplementation,
      routeRelativePath: routeImplementation
        ? path.relative(routeRoot, relativePath)
        : undefined,
    })
  }
  return files
}

describe('page data architecture guard', () => {
  it('detects forbidden entry-point dependencies and route implementation files', () => {
    const files: ArchitectureFile[] = [
      {
        path: 'src/app/(app)/example/page.tsx',
        source: "import { prisma } from '@/lib/prisma'\nimport { read } from '@/actions/example'\ngetSession()",
        routeImplementation: true,
        routeRelativePath: 'page.tsx',
      },
      {
        path: 'src/app/(app)/example/loading.tsx',
        source: 'export default function Loading() { return null }',
        routeImplementation: true,
        routeRelativePath: 'loading.tsx',
      },
      {
        path: 'src/app/(app)/example/example-client.tsx',
        source: 'export function ExampleClient() { return null }',
        routeImplementation: true,
        routeRelativePath: 'example-client.tsx',
      },
    ]

    expect(inspectArchitectureFiles(files, new Set(['page.tsx']))).toEqual([
      { path: 'src/app/(app)/example/page.tsx', rule: 'direct-prisma' },
      { path: 'src/app/(app)/example/page.tsx', rule: 'page-action' },
      { path: 'src/app/(app)/example/page.tsx', rule: 'page-session' },
      { path: 'src/app/(app)/example/loading.tsx', rule: 'route-loading' },
      { path: 'src/app/(app)/example/example-client.tsx', rule: 'route-implementation' },
    ])
  })

  it('allows framework-only route files and purpose modules without Prisma entry imports', () => {
    expect(inspectArchitectureFiles([
      {
        path: 'src/app/(app)/example/page.tsx',
        source: "import { ExampleView } from '@/components/example/example-view'",
        routeImplementation: true,
        routeRelativePath: 'page.tsx',
      },
      {
        path: 'src/app/(app)/example/error.tsx',
        source: 'export default function ErrorPage() { return null }',
        routeImplementation: true,
        routeRelativePath: 'error.tsx',
      },
      {
        path: 'src/components/example/example-view.tsx',
        source: "import { getExample } from '@/lib/example/query'",
      },
    ], new Set(['page.tsx', 'error.tsx']))).toEqual([])
  })

  it('exempts colocated tests from entry-dependency rules but not from route placement', () => {
    // Architecture tests legitimately quote the forbidden specifiers they assert against.
    // The rules describe route, render, action, and route-handler modules -- not tests.
    expect(inspectArchitectureFiles([
      {
        path: 'src/components/example/example-streaming.test.tsx',
        source: "expect(page).not.toContain('@/lib/prisma')\n"
          + "expect(page).not.toContain('@/actions/')\n"
          + "expect(page).not.toContain('getSession')",
      },
    ])).toEqual([])

    // A test colocated in a route directory is still misplaced.
    expect(inspectArchitectureFiles([
      {
        path: 'src/app/(app)/example/sort.test.ts',
        source: 'it("sorts", () => {})',
        routeImplementation: true,
        routeRelativePath: 'sort.test.ts',
      },
    ], new Set(['page.tsx']))).toEqual([
      { path: 'src/app/(app)/example/sort.test.ts', rule: 'route-implementation' },
    ])
  })

  for (const purpose of MIGRATED_PURPOSES) {
    it(`${purpose.name} follows the migrated page architecture`, () => {
      const routeViolations = purpose.routes.flatMap(({ root, allowedFiles }) => {
        for (const allowedFile of allowedFiles) {
          if (!FRAMEWORK_ROUTE_FILES.has(path.basename(allowedFile))) {
            throw new Error(`Non-framework route file in ${purpose.name} allowlist: ${allowedFile}`)
          }
        }
        return inspectArchitectureFiles(
          collectTypeScriptFiles(root, true),
          new Set(allowedFiles),
        )
      })
      const entryFiles = purpose.entryRoots.flatMap(root => collectTypeScriptFiles(root, false))

      expect([...routeViolations, ...inspectArchitectureFiles(entryFiles)]).toEqual([])
    })
  }
})
