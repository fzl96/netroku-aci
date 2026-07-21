"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { nextBinaryTheme } from "./theme-toggle";
import { authClient } from "@/lib/auth-client";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useApicHosts } from "@/components/ApicHostsProvider";
import {
  resolveNavigationScope,
  targetPathForScope,
  type NavigationScope,
} from "@/lib/navigation-scope";

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
  IconServer2,
  IconUsers,
  IconSettings,
  IconLogout,
  IconLayoutDashboard,
  IconHistory,
  IconTopologyStar3,
  IconBook,
  IconChevronDown,
  IconHeartbeat,
} from "@tabler/icons-react";

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavChild = {
  href?: string;
  label: string;
  children?: NavChild[];
};

type NavItem = {
  href?: string;
  label: string;
  icon: React.ReactNode;
  children?: NavChild[];
  adminOnly?: boolean;
  action?: "logout";
  apicParam?: true;
};

type NavSection = { group: string; items: NavItem[] };

const ACI_NAV: NavSection[] = [
  {
    group: "",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: <IconLayoutDashboard size={15} stroke={1.75} />,
      },
      {
        href: "/docs",
        label: "Documentation",
        icon: <IconBook size={15} stroke={1.75} />,
      },
    ],
  },
  {
    group: "Infrastructure",
    items: [
      {
        href: "/apic-hosts",
        label: "APIC Hosts",
        icon: <IconRouter size={15} stroke={1.75} />,
        adminOnly: true,
      },
      {
        href: "/endpoints",
        label: "Endpoints",
        icon: <IconDeviceDesktopSearch size={15} stroke={1.75} />,
        apicParam: true,
      },
      {
        href: "/epgs",
        label: "EPG",
        icon: <IconTopologyStar3 size={15} stroke={1.75} />,
        apicParam: true,
      },
      {
        href: "/interface-health",
        label: "Interfaces",
        icon: <IconActivity size={15} stroke={1.75} />,
        apicParam: true,
      },
      {
        href: "/nodes",
        label: "Nodes",
        icon: <IconServer2 size={15} stroke={1.75} />,
        apicParam: true,
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
  {
    group: "System",
    items: [
      {
        href: "/history",
        label: "History",
        icon: <IconHistory size={15} stroke={1.75} />,
      },
      {
        href: "/settings",
        label: "Settings",
        icon: <IconSettings size={15} stroke={1.75} />,
      },
      {
        href: "/users",
        label: "Users",
        icon: <IconUsers size={15} stroke={1.75} />,
        adminOnly: true,
      },
      {
        label: "Logout",
        icon: <IconLogout size={15} stroke={1.75} />,
        action: "logout",
      },
    ],
  },
];

const LEGACY_INFRASTRUCTURE: NavSection = {
  group: "Infrastructure",
  items: [
    {
      href: "/legacy/devices",
      label: "Devices",
      icon: <IconServer2 size={15} stroke={1.75} />,
    },
    {
      href: "/legacy/health",
      label: "Health",
      icon: <IconHeartbeat size={15} stroke={1.75} />,
    },
    {
      href: "/legacy/interfaces",
      label: "Interfaces",
      icon: <IconActivity size={15} stroke={1.75} />,
    },
    {
      href: "/legacy/endpoints",
      label: "Endpoints",
      icon: <IconDeviceDesktopSearch size={15} stroke={1.75} />,
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AppSidebar({
  role,
  initialScope,
}: {
  role: "admin" | "member";
  initialScope: NavigationScope;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sharedScope, setSharedScope] = useState(initialScope);
  const apicHosts = useApicHosts();
  const defaultApicId = apicHosts[0]?.id;
  const scope = resolveNavigationScope(pathname, sharedScope);
  const sourceNav = scope === "aci"
    ? ACI_NAV
    : [ACI_NAV[0], LEGACY_INFRASTRUCTURE, ACI_NAV[ACI_NAV.length - 1]];
  const nav = sourceNav.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.adminOnly || role === "admin"),
  })).filter((section) => section.items.length > 0);

  function isActive(href?: string) {
    if (!href) return false;
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await authClient.signOut();
    router.replace("/signin");
    router.refresh();
  }

  function handleScopeChange(value: string) {
    if (value !== "aci" && value !== "legacy") return;
    const nextScope: NavigationScope = value;
    setSharedScope(nextScope);
    document.cookie = `netroku_scope=${nextScope}; Path=/; SameSite=Lax; Max-Age=31536000`;
    const target = targetPathForScope(pathname, nextScope);
    if (target !== pathname) router.push(target);
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Switch infrastructure scope"
              className="flex w-full items-center gap-3 rounded-lg p-1 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
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
                Netroku {scope === "aci" ? "ACI" : "Legacy"}
              </p>
              <p className="mt-[5px] text-[10px] leading-none text-sidebar-foreground/55">
                Infrastructure view
              </p>
            </div>
              <IconChevronDown
                size={14}
                stroke={1.75}
                className="ml-auto text-sidebar-foreground/55"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            <DropdownMenuLabel>Infrastructure scope</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={scope} onValueChange={handleScopeChange}>
              <DropdownMenuRadioItem value="aci">Netroku ACI</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="legacy">Netroku Legacy</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((section) => (
          <SidebarGroup key={section.group}>
            {section.group && (
              <SidebarGroupLabel>{section.group}</SidebarGroupLabel>
            )}
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
                  <SidebarMenuItem key={item.href ?? item.label}>
                    {item.action === "logout" ? (
                      <SidebarMenuButton
                        type="button"
                        onClick={() => setLogoutOpen(true)}
                        disabled={loggingOut}
                        className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
                      >
                        {item.icon}
                        <span>
                          {loggingOut ? "Logging out..." : item.label}
                        </span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton asChild isActive={groupActive}>
                        <Link
                          href={
                            item.apicParam && defaultApicId
                              ? `${item.href}?apic=${defaultApicId}`
                              : (item.href ?? "/")
                          }
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
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

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Log out?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              You will need to sign in again before using Netroku ACI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <AlertDialogCancel
              disabled={loggingOut}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              disabled={loggingOut}
              className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loggingOut ? "Logging out..." : "Log out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
