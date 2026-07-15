"use client";

import Image from "next/image";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTheme } from "./ThemeProvider";
import { nextBinaryTheme } from "./theme-toggle";

// Global mobile-only top bar. Carries the sidebar trigger (the only way to
// reach the nav on a phone) plus brand + theme toggle. Hidden on md+ where the
// persistent sidebar is visible.
export function MobileTopBar() {
  const { setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-sm md:hidden">
      <SidebarTrigger className="text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Image
          src="/brand-icon.png"
          alt=""
          width={28}
          height={28}
          aria-hidden
          className="h-7 w-7 shrink-0"
        />
        <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
          Netroku ACI
        </span>
      </div>
      <button
        type="button"
        onClick={() => setTheme((theme) => nextBinaryTheme(theme))}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        <IconMoon size={16} stroke={2} className="block dark:hidden" />
        <IconSun size={16} stroke={2} className="hidden dark:block" />
      </button>
    </header>
  );
}
