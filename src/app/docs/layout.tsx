import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout tree={source.getPageTree()}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
