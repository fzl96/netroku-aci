FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock ./

# Work around oven-sh/bun#34821: when a tarball download is cut off mid-body (the
# connection closes before Content-Length bytes arrive), bun's streaming installer
# hands the short body to the extractor instead of retrying, which surfaces as
# "Fail extracting tarball". It never reaches an integrity check, so verification
# cannot catch it. Disabling streaming makes bun download fully, then extract.
# Upstream fix (oven-sh/bun#34827) is closed unmerged and 1.3.14 is the latest
# release, so this flag is the only fix available. Revisit when it lands.
ENV BUN_FEATURE_FLAG_DISABLE_STREAMING_INSTALL=1

RUN bun install --frozen-lockfile


FROM oven/bun:1.3.14 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run prisma:generate
RUN bun run build


FROM oven/bun:1.3.14 AS prod-deps

WORKDIR /app

COPY package.json bun.lock ./

# Work around oven-sh/bun#34821: when a tarball download is cut off mid-body (the
# connection closes before Content-Length bytes arrive), bun's streaming installer
# hands the short body to the extractor instead of retrying, which surfaces as
# "Fail extracting tarball". It never reaches an integrity check, so verification
# cannot catch it. Disabling streaming makes bun download fully, then extract.
# Upstream fix (oven-sh/bun#34827) is closed unmerged and 1.3.14 is the latest
# release, so this flag is the only fix available. Revisit when it lands.
ENV BUN_FEATURE_FLAG_DISABLE_STREAMING_INSTALL=1

# --production drops the 13 devDependencies (typescript, eslint, tailwind, shadcn,
# tsx, @types/*) that only the builder stage needs.
RUN bun install --production --frozen-lockfile

# The startup chain runs `prisma migrate deploy`, so the runner needs the prisma CLI
# even though it is a devDependency. It survives --production only because it is an
# optional peerDependency of @prisma/client, which bun installs. That is implicit
# enough to be worth asserting: fail the build here rather than the container at boot.
RUN test -f node_modules/prisma/package.json \
  || (echo "prisma CLI missing from production install — startup migrations would fail" && exit 1)


FROM oven/bun:1.3.14 AS runner

WORKDIR /app

ENV NODE_ENV=production

# .next/standalone is a complete app root: server.js, a minimal package.json, and
# only the node_modules Next traced as reachable. It goes at /app, and server.js
# chdir()s to its own directory at startup. Static assets and public/ are excluded
# from the trace by design and must be layered back on.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma needs three things tracing cannot give us, so copy them explicitly rather
# than hope the trace caught them:
#   - the generated client (.prisma) and its native query engine, loaded at runtime
#     by path rather than by import, so tracing does not always follow it
#   - @prisma/client itself, to guarantee it matches the generated client
#   - the prisma CLI and its engines, which nothing imports at all — it is invoked
#     as a command by the startup migration step
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=prod-deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=prod-deps /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=prod-deps /app/node_modules/@prisma/config ./node_modules/@prisma/config

# The schema and migrations for `migrate deploy`, plus the sources seed-admin.ts
# imports (it runs outside the traced graph, so it needs real files and the path
# aliases from tsconfig.json).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

# Everything is invoked by explicit path. standalone ships its own minimal
# package.json with no scripts, and node_modules/.bin is not part of the traced
# output, so `bun run <script>` and bare `prisma` are both unavailable here.
#
# The prisma CLI keeps going through `node`, which in this image is bun's node
# wrapper rather than real Node — that is already how the CLI runs today via its
# .bin shebang, so this changes nothing about how it executes.
#
# Migrations only: generation already happened in the builder, and re-running it
# would re-download the engines from binaries.prisma.sh on every boot.
# This is the self-contained default, so `docker run <image>` still works on its
# own. docker-compose.yml overrides it: migrations move to a one-shot `migrate`
# service so they run exactly once regardless of how many app containers start.
#
# exec form, and `exec` on the last command: without it the chain runs under
# /bin/sh, which stays PID 1 and does not forward SIGTERM, so `docker stop` would
# kill the server abruptly instead of letting it shut down cleanly.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && bun prisma/seed-admin.ts && exec bun server.js"]
