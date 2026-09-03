import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const VIEW_SHELL_ROUTES = [
  ['src/app/(app)/dashboard/page.tsx', 'src/components/dashboard/dashboard-shell.tsx'],
  ['src/app/(app)/endpoints/page.tsx', 'src/components/endpoints/endpoints-shell.tsx'],
  ['src/app/(app)/nodes/page.tsx', 'src/components/nodes/nodes-shell.tsx'],
  ['src/app/(app)/history/page.tsx', 'src/components/history/history-shell.tsx'],
  [
    'src/app/(app)/interface-health/page.tsx',
    'src/components/interface-health/interface-health-shell.tsx',
  ],
  ['src/app/(app)/apic-hosts/page.tsx', 'src/components/apic-hosts/apic-hosts-shell.tsx'],
  ['src/app/(app)/scheduler/page.tsx', 'src/components/scheduler/scheduler-shell.tsx'],
  ['src/app/(app)/settings/page.tsx', 'src/components/settings/settings-shell.tsx'],
  ['src/app/(app)/users/page.tsx', 'src/components/users/users-shell.tsx'],
  [
    'src/app/(app)/inventory/devices/page.tsx',
    'src/components/inventory/devices/devices-shell.tsx',
  ],
  [
    'src/app/(app)/inventory/devices/[id]/page.tsx',
    'src/components/inventory/devices/device-detail-shell.tsx',
  ],
  [
    'src/app/(app)/inventory/devices/import/page.tsx',
    'src/components/inventory/devices/device-import-shell.tsx',
  ],
  ['src/app/(app)/inventory/racks/page.tsx', 'src/components/inventory/racks/racks-shell.tsx'],
  ['src/app/(app)/legacy/devices/page.tsx', 'src/components/legacy/devices/devices-shell.tsx'],
  [
    'src/app/(app)/legacy/endpoints/page.tsx',
    'src/components/legacy/endpoints/endpoints-shell.tsx',
  ],
  ['src/app/(app)/legacy/health/page.tsx', 'src/components/legacy/health/health-shell.tsx'],
  [
    'src/app/(app)/legacy/interfaces/page.tsx',
    'src/components/legacy/interfaces/interfaces-shell.tsx',
  ],
] as const

const PAGE_WIDE_CLIENT_WRAPPERS = [
  ['src/components/endpoints/endpoints-client.tsx', 'EndpointsClient'],
  ['src/components/nodes/nodes-client.tsx', 'NodesClient'],
  ['src/components/interface-health/interface-health-client.tsx', 'InterfaceHealthFrame'],
  ['src/components/legacy/interfaces/interfaces-client.tsx', 'LegacyInterfacesFrame'],
] as const

function absolutePath(relativePath: string) {
  return path.join(process.cwd(), relativePath)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('shell-based page architecture', () => {
  it('routes import existing shell modules', () => {
    const violations = VIEW_SHELL_ROUTES.flatMap(([routePath, shellPath]) => {
      const shellSpecifier = `@/${shellPath.replace(/^src\//, '').replace(/\.tsx$/, '')}`
      const routeSource = readFileSync(absolutePath(routePath), 'utf8')
      const importsShell = new RegExp(`from\\s+['\"]${escapeRegExp(shellSpecifier)}['\"]`).test(
        routeSource,
      )

      return [
        ...(existsSync(absolutePath(shellPath)) ? [] : [`missing shell: ${shellPath}`]),
        ...(importsShell ? [] : [`route does not import ${shellSpecifier}: ${routePath}`]),
      ]
    })

    expect(violations).toEqual([])
  })

  it('removes the superseded view modules', () => {
    const remainingViews = VIEW_SHELL_ROUTES.map(([, shellPath]) =>
      shellPath.replace(/-shell\.tsx$/, '-view.tsx'),
    ).filter((viewPath) => existsSync(absolutePath(viewPath)))

    expect(remainingViews).toEqual([])
  })

  it('removes known page-wide client wrapper exports', () => {
    const remainingExports = PAGE_WIDE_CLIENT_WRAPPERS.filter(([clientPath, exportName]) => {
      if (!existsSync(absolutePath(clientPath))) return false

      const source = readFileSync(absolutePath(clientPath), 'utf8')
      const namedDeclaration = new RegExp(
        `export\\s+(?:async\\s+)?(?:function|const|class)\\s+${exportName}\\b`,
      )
      const exportList = new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`)

      return namedDeclaration.test(source) || exportList.test(source)
    }).map(([clientPath, exportName]) => `${clientPath}: ${exportName}`)

    expect(remainingExports).toEqual([])
  })
})
