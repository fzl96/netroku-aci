FROM oven/bun:1.3.14 AS deps

WORKDIR /app

COPY package.json bun.lock ./

ENV BUN_FEATURE_FLAG_DISABLE_STREAMING_INSTALL=1

RUN bun install --frozen-lockfile


FROM oven/bun:1.3.14 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run prisma:generate
RUN bun run build


FROM oven/bun:1.3.14 AS migration

WORKDIR /app

COPY prisma ./prisma

CMD ["bunx", "prisma", "migrate", "deploy"]


FROM oven/bun:1.3.14 AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["bun", "server.js"]
