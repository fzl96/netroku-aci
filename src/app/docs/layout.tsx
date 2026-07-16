import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { docsLayoutOptions } from "./layout-options";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout {...docsLayoutOptions} tree={source.getPageTree()}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
