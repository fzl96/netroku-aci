"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { nextBinaryTheme } from "./theme-toggle";
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
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Suppress the full leaf-active treatment (bg pill + left bar) for parent
// containers — they only need to look "expanded", not "current page".
const PARENT_ACTIVE_CLS =
  "data-[active=true]:bg-transparent data-[active=true]:before:hidden data-[active=true]:[&>svg:first-child]:text-sidebar-foreground";
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
  IconActivity,
} from "@tabler/icons-react";

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavChild = {
  href?: string;
  label: string;
  children?: NavChild[];
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  children?: NavChild[];
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Infrastructure",
    items: [
      {
        href: "/apic-hosts",
        label: "APIC Hosts",
        icon: <IconRouter size={15} stroke={1.75} />,
      },
      {
        href: "/endpoints",
        label: "Endpoints",
        icon: <IconDeviceDesktopSearch size={15} stroke={1.75} />,
      },
      {
        href: "/interface-health",
        label: "Interface Health",
        icon: <IconActivity size={15} stroke={1.75} />,
      },
    ],
  },
  {
    group: "Workflows",
    items: [
      {
        href: "/bridge-domains",
        label: "Bridge Domains",
        icon: <IconDatabase size={15} stroke={1.75} />,
        children: [
          {
            href: "/bridge-domains/l2",
            label: "L2 Only",
            children: [
              { href: "/bridge-domains/l2/deploy", label: "Deploy" },
              { href: "/bridge-domains/l2/rollback", label: "Rollback" },
            ],
          },
          {
            href: "/bridge-domains/l3",
            label: "L3",
            children: [
              { href: "/bridge-domains/l3/deploy", label: "Deploy" },
              { href: "/bridge-domains/l3/rollback", label: "Rollback" },
            ],
          },
        ],
      },
      {
        href: "/bridge-domains/epgs",
        label: "EPG",
        icon: <IconAffiliate size={15} stroke={1.75} />,
        children: [
          { href: "/bridge-domains/epgs/deploy", label: "Deploy" },
          { href: "/bridge-domains/epgs/rollback", label: "Rollback" },
        ],
      },
      {
        href: "/static-ports",
        label: "Static Ports",
        icon: <IconServer size={15} stroke={1.75} />,
        children: [
          { href: "/static-ports/deploy", label: "Deploy" },
          { href: "/static-ports/rollback", label: "Rollback" },
        ],
      },
      {
        href: "/interface-selectors",
        label: "Interface Selectors",
        icon: <IconPlugConnected size={15} stroke={1.75} />,
        children: [
          { href: "/interface-selectors/deploy", label: "Deploy" },
          { href: "/interface-selectors/rollback", label: "Rollback" },
        ],
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const { setTheme } = useTheme();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  function isNodeActive(node: NavChild): boolean {
    return Boolean(
      (node.href && isActive(node.href)) ||
      node.children?.some((child) => isNodeActive(child)),
    );
  }

  function renderSubNode(node: NavChild, depth = 0): React.ReactNode {
    const active = isNodeActive(node);

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
                className={cn("font-normal", PARENT_ACTIVE_CLS)}
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
                  "mx-2 gap-0.5 py-0",
                  depth === 0 ? "ml-3" : "ml-4",
                ].join(" ")}
              >
                {node.children.map((child) => renderSubNode(child, depth + 1))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuSubItem>
        </Collapsible>
      );
    }

    return (
      <SidebarMenuSubItem key={node.href ?? node.label}>
        {node.href ? (
          <SidebarMenuSubButton
            asChild
            size="sm"
            isActive={
              pathname === node.href || pathname.startsWith(node.href + "/")
            }
          >
            <Link href={node.href}>
              <span>{node.label}</span>
            </Link>
          </SidebarMenuSubButton>
        ) : (
          <span className="flex h-7 min-w-0 items-center px-2 text-xs text-muted-foreground">
            {node.label}
          </span>
        )}
      </SidebarMenuSubItem>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader className="h-16 flex-row items-center border-b border-sidebar-border/60 px-3 py-0">
        <div className="flex items-center gap-3">
          <Image
            src="/brand-icon.png"
            alt=""
            width={36}
            height={36}
            aria-hidden
            className="h-9 w-9 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-none tracking-tight text-sidebar-foreground">
              Netroku ACI
            </p>
            <p className="mt-[5px] text-[10px] leading-none text-sidebar-foreground/55">
              By Furina
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
                const groupActive =
                  item.children && item.children.length > 0
                    ? pathname === item.href ||
                      item.children.some((child) => isNodeActive(child))
                    : isActive(item.href);

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
                          <SidebarMenuButton
                            isActive={groupActive}
                            className={PARENT_ACTIVE_CLS}
                          >
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
                            {item.children.map((child) => renderSubNode(child))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
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
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 px-3 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-sidebar-foreground/50">v0.1.0</p>
          <button
            type="button"
            onClick={() => setTheme((theme) => nextBinaryTheme(theme))}
            className="rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground hover:bg-sidebar-accent"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <IconMoon size={13} stroke={2} className="block dark:hidden" />
            <IconSun size={13} stroke={2} className="hidden dark:block" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
