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
} from '@tabler/icons-react'

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavChild = {
  href: string
  label: string
}

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  children?: NavChild[]
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Fabric',
    items: [
      {
        href: '/apic-hosts',
        label: 'APIC Hosts',
        icon: <IconRouter size={15} stroke={1.75} />,
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
    group: 'Policy',
    items: [
      {
        href: '/bridge-domains',
        label: 'Bridge Domains',
        icon: <IconDatabase size={15} stroke={1.75} />,
      },
      {
        href: '/epgs',
        label: 'EPGs',
        icon: <IconAffiliate size={15} stroke={1.75} />,
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
                const groupActive = isActive(item.href)

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
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.href}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === child.href || pathname.startsWith(child.href + '/')}
                                >
                                  <Link href={child.href}>
                                    <span>{child.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
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
