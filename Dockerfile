FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock ./

ENV BUN_CONFIG_NO_VERIFY=1

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

ENV BUN_CONFIG_NO_VERIFY=1

RUN bun install --frozen-lockfile


FROM oven/bun:1.3.14 AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

# Only apply migrations at startup. `db:setup` also runs `prisma generate`, which
# re-downloads the engine binaries from binaries.prisma.sh on every boot — the client
# was already generated in the builder stage and copied in above, so that download is
# pure waste and hangs startup on a host without egress to Prisma's CDN.
CMD bun run prisma:deploy && bun run seed:admin && bun run start
