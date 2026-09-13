import {
  IconServer,
  IconDatabase,
  IconAffiliate,
  IconPlugConnected,
  IconRouter,
  IconDeviceDesktopSearch,
  IconActivity,
  IconServer2,
  IconUsers,
  IconSettings,
  IconLogout,
  IconLayoutDashboard,
  IconHistory,
  IconTopologyStar3,
  IconBook,
  IconHeartbeat,
  IconClockPlay,
  IconBoxSeam,
} from '@tabler/icons-react'

// ─── Nav structure ────────────────────────────────────────────────────────────

export type NavChild = {
  href?: string
  label: string
  children?: NavChild[]
}

type NavItem = {
  href?: string
  label: string
  icon: React.ReactNode
  children?: NavChild[]
  adminOnly?: boolean
  action?: 'logout'
  apicParam?: true
}

type NavSection = { group: string; items: NavItem[] }

export const ACI_NAV: NavSection[] = [
  {
    group: '',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: <IconLayoutDashboard size={15} stroke={1.75} />,
      },
      {
        href: '/docs',
        label: 'Documentation',
        icon: <IconBook size={15} stroke={1.75} />,
      },
      {
        href: '/inventory',
        label: 'Inventory',
        icon: <IconBoxSeam size={15} stroke={1.75} />,
        children: [
          {
            href: '/inventory/devices',
            label: 'Devices',
          },
          {
            href: '/inventory/racks',
            label: 'Racks',
          },
        ],
      },
    ],
  },
  {
    group: 'Infrastructure',
    items: [
      {
        href: '/apic-hosts',
        label: 'APIC Hosts',
        icon: <IconRouter size={15} stroke={1.75} />,
        adminOnly: true,
      },
      {
        href: '/scheduler',
        label: 'Scheduler',
        icon: <IconClockPlay size={15} stroke={1.75} />,
        adminOnly: true,
      },
      {
        href: '/epgs',
        label: 'EPG',
        icon: <IconTopologyStar3 size={15} stroke={1.75} />,
        apicParam: true,
      },
      {
        href: '/endpoints',
        label: 'Endpoints',
        icon: <IconDeviceDesktopSearch size={15} stroke={1.75} />,
        apicParam: true,
      },
      {
        href: '/nodes',
        label: 'Nodes',
        icon: <IconServer2 size={15} stroke={1.75} />,
        apicParam: true,
      },
      {
        href: '/interface-health',
        label: 'Interfaces',
        icon: <IconActivity size={15} stroke={1.75} />,
        apicParam: true,
      },
    ],
  },
  {
    group: 'Workflows',
    items: [
      {
        href: '/bridge-domains',
        label: 'Bridge Domains',
        icon: <IconDatabase size={15} stroke={1.75} />,
        children: [
          {
            href: '/bridge-domains/l2',
            label: 'L2 Only',
            children: [
              { href: '/bridge-domains/l2/deploy', label: 'Deploy' },
              { href: '/bridge-domains/l2/rollback', label: 'Rollback' },
            ],
          },
          {
            href: '/bridge-domains/l3',
            label: 'L3',
            children: [
              { href: '/bridge-domains/l3/deploy', label: 'Deploy' },
              { href: '/bridge-domains/l3/rollback', label: 'Rollback' },
            ],
          },
        ],
      },
      {
        href: '/bridge-domains/epgs',
        label: 'EPG',
        icon: <IconAffiliate size={15} stroke={1.75} />,
        children: [
          { href: '/bridge-domains/epgs/deploy', label: 'Deploy' },
          { href: '/bridge-domains/epgs/rollback', label: 'Rollback' },
        ],
      },
      {
        href: '/static-ports',
        label: 'Static Ports',
        icon: <IconServer size={15} stroke={1.75} />,
        children: [
          { href: '/static-ports/deploy', label: 'Deploy' },
          { href: '/static-ports/rollback', label: 'Rollback' },
        ],
      },
      {
        href: '/interface-selectors',
        label: 'Interface Selectors',
        icon: <IconPlugConnected size={15} stroke={1.75} />,
        children: [
          { href: '/interface-selectors/deploy', label: 'Deploy' },
          { href: '/interface-selectors/rollback', label: 'Rollback' },
        ],
      },
    ],
  },
  {
    group: 'System',
    items: [
      {
        href: '/history',
        label: 'History',
        icon: <IconHistory size={15} stroke={1.75} />,
      },
      {
        href: '/settings',
        label: 'Settings',
        icon: <IconSettings size={15} stroke={1.75} />,
      },
      {
        href: '/users',
        label: 'Users',
        icon: <IconUsers size={15} stroke={1.75} />,
        adminOnly: true,
      },
      {
        label: 'Logout',
        icon: <IconLogout size={15} stroke={1.75} />,
        action: 'logout',
      },
    ],
  },
]

export const LEGACY_INFRASTRUCTURE: NavSection = {
  group: 'Infrastructure',
  items: [
    {
      href: '/legacy/devices',
      label: 'Devices',
      icon: <IconServer2 size={15} stroke={1.75} />,
    },
    {
      href: '/legacy/health',
      label: 'Health',
      icon: <IconHeartbeat size={15} stroke={1.75} />,
    },
    {
      href: '/legacy/interfaces',
      label: 'Interfaces',
      icon: <IconActivity size={15} stroke={1.75} />,
    },
    {
      href: '/legacy/endpoints',
      label: 'Endpoints',
      icon: <IconDeviceDesktopSearch size={15} stroke={1.75} />,
    },
  ],
}
