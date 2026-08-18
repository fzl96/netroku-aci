import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Emit .next/standalone: a self-contained server with only the files Next's
  // tracing finds reachable, instead of the whole node_modules. Keeps @next/swc
  // (~239MB of build-time Rust compiler) out of the runtime image.
  output: "standalone",
};

const withMDX = createMDX();

export default withMDX(nextConfig);
