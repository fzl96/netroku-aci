"use client";

import { IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "@/components/ThemeProvider";
import { nextBinaryTheme } from "@/components/theme-toggle";

export function DocsThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      title="Toggle theme"
      onClick={() => setTheme((theme) => nextBinaryTheme(theme))}
      className="ms-auto inline-flex size-8 items-center justify-center rounded-full border border-fd-border bg-fd-secondary/50 text-fd-muted-foreground transition-colors hover:border-fd-foreground/20 hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background"
    >
      <IconMoon aria-hidden className="size-4 dark:hidden" />
      <IconSun aria-hidden className="hidden size-4 dark:block" />
    </button>
  );
}
