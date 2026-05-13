'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  IconServer,
  IconDatabase,
  IconAffiliate,
  IconPlugConnected,
  IconSun,
  IconMoon,
  IconChevronRight,
  IconRouter,
  IconDeviceDesktopSearch,
} from '@tabler/icons-react'

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavChild = {
  href?: string
  label: string
  children?: NavChild[]
}

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  children?: NavChild[]
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Infrastructure',
    items: [
      {
        href: '/apic-hosts',
        label: 'APIC Hosts',
        icon: <IconRouter size={15} stroke={1.75} />,
      },
      {
        href: '/endpoints',
        label: 'Endpoints',
        icon: <IconDeviceDesktopSearch size={15} stroke={1.75} />,
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
]

// ─── Component ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
  }

  function isNodeActive(node: NavChild): boolean {
    return Boolean(
      (node.href && isActive(node.href)) ||
      node.children?.some(child => isNodeActive(child))
    )
  }

  function renderSubNode(node: NavChild, depth = 0): React.ReactNode {
    const active = isNodeActive(node)

    if (node.children && node.children.length > 0) {
      return (
        <Collapsible
          key={node.href ?? node.label}
          asChild
          defaultOpen={active}
          className="group/subcollapsible"
        >
          <SidebarMenuSubItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuSubButton
                asChild
                size="sm"
                isActive={active}
                className="font-normal"
              >
                <button type="button">
                  <span>{node.label}</span>
                  <IconChevronRight
                    size={12}
                    stroke={1.75}
                    className="ml-auto transition-transform duration-200 group-data-[state=open]/subcollapsible:rotate-90"
                  />
                </button>
              </SidebarMenuSubButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub
                className={[
                  'mx-2 gap-0.5 py-0',
                  depth === 0 ? 'ml-3' : 'ml-4',
                ].join(' ')}
              >
                {node.children.map(child => renderSubNode(child, depth + 1))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuSubItem>
        </Collapsible>
      )
    }

    return (
      <SidebarMenuSubItem key={node.href ?? node.label}>
        {node.href ? (
          <SidebarMenuSubButton
            asChild
            size="sm"
            isActive={pathname === node.href || pathname.startsWith(node.href + '/')}
          >
            <Link href={node.href}>
              <span>{node.label}</span>
            </Link>
          </SidebarMenuSubButton>
        ) : (
          <span className="flex h-7 min-w-0 items-center px-2 text-xs text-[var(--text-muted)]">
            {node.label}
          </span>
        )}
      </SidebarMenuSubItem>
    )
  }

  return (
    <Sidebar variant="floating">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-1 py-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0 shadow-sm">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1.5L13.5 4.75v6.5L8 14.5 2.5 11.25v-6.5L8 1.5z"
                stroke="white"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="8" r="1.75" fill="white" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-none tracking-tight text-[var(--text)]">
              ACI Toolkit
            </p>
            <p className="text-[10px] leading-none mt-[5px] text-[var(--sb-brand-sub)]">
              Cisco APIC
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((section) => (
          <SidebarGroup key={section.group}>
            <SidebarGroupLabel>{section.group}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => {
                const groupActive = item.children && item.children.length > 0
                  ? pathname === item.href || item.children.some(child => isNodeActive(child))
                  : isActive(item.href)

                if (item.children && item.children.length > 0) {
                  return (
                    <Collapsible
                      key={item.href}
                      asChild
                      defaultOpen={groupActive}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton isActive={groupActive}>
                            {item.icon}
                            <span>{item.label}</span>
                            <IconChevronRight
                              size={13}
                              stroke={1.75}
                              className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map(child => renderSubNode(child))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  )
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={groupActive}>
                      <Link href={item.href}>
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-[10px] text-[var(--sb-footer)]">v0.1.0</p>
          <button
            onClick={toggle}
            className="p-1 rounded-md text-[var(--sb-footer)] transition-colors hover:opacity-70"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <IconSun size={13} stroke={2} />
            ) : (
              <IconMoon size={13} stroke={2} />
            )}
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
