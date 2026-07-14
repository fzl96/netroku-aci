import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Static search index built from the docs source. The Cmd/Ctrl+K dialog
// provided by RootProvider queries this endpoint.
export const { GET } = createFromSource(source);
