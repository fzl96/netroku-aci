import Image from "next/image";
import { IconLayoutDashboard } from "@tabler/icons-react";
import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { DocsThemeToggle } from "@/components/docs/DocsThemeToggle";

function DocsBrand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/brand-icon.png"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="size-6 dark:invert"
        priority
      />
      <span className="font-serif text-[15px] font-medium tracking-tight text-fd-foreground">
        Netroku<span className="text-fd-muted-foreground">/aci</span>
      </span>
    </span>
  );
}

export const docsLayoutOptions = {
  nav: {
    title: <DocsBrand />,
    url: "/",
  },
  links: [
    {
      type: "main",
      text: "Dashboard",
      url: "/dashboard",
      icon: <IconLayoutDashboard aria-hidden />,
    },
  ],
  sidebar: {
    defaultOpenLevel: 1,
    footer: <DocsThemeToggle />,
  },
  themeSwitch: {
    enabled: false,
  },
} satisfies Omit<DocsLayoutProps, "tree" | "children">;
