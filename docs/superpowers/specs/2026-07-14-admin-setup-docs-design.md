# Design: Admin & Setup Docs — index + deployment

**Date:** 2026-07-14  
**Scope:** `content/docs/admin/index.mdx` and `content/docs/admin/deployment.mdx`

---

## Overview

Write the first two live pages of the Admin & Setup docs section. Content is adapted from the existing README. No new pages; no changes to the fumadocs routing or meta.json.

**Audience:** Network engineers / IT admins self-hosting Netroku ACI on a local machine.

---

## `index.mdx` — Admin & Setup Overview

Short intro paragraph (2 sentences) explaining what the section covers.

### Prerequisites checklist

- Bun ≥ 1.1 **or** Node.js ≥ 20
- Git
- Docker with Docker Compose (only required when using the local database option)

### What's in this section

Brief list linking to each sub-page with a one-liner description:

- Deployment
- APIC Hosts
- Scheduled Resync
- Users

---

## `deployment.mdx` — Deployment

Seven numbered sections covering local-only app setup, with database supporting both Docker and external Postgres.

### 1. Install a runtime

- Bun (recommended) shown first — install link, `bun --version` verify step
- Node.js 20+ as equal alternative — `node --version` verify
- Windows callout: use WSL2 or Node.js (Bun TLS compat issue with self-signed APICs)

### 2. Clone the repository

```
git clone <repo-url> netroku-aci
cd netroku-aci
bun install   # or: npm install
```

### 3. Configure environment

- `cp .env.example .env`
- Table of all env vars:

| Variable              | Required      | Purpose                                               | How to generate               |
| --------------------- | ------------- | ----------------------------------------------------- | ----------------------------- |
| `DATABASE_URL`        | yes           | Postgres connection string                            | See database section          |
| `BETTER_AUTH_SECRET`  | yes           | Session signing secret                                | `openssl rand -hex 32`        |
| `BETTER_AUTH_URL`     | yes           | Base URL the app is served from                       | e.g. `http://localhost:3000`  |
| `NEXT_PUBLIC_APP_URL` | yes           | Public base URL used by the browser                   | e.g. `http://localhost:3000`  |
| `TRUSTED_ORIGINS`     | yes           | Comma-separated origins Better Auth accepts           | Add LAN IPs / Tailscale hosts |
| `SECURE_COOKIES`      | no            | Set to `true` only when served exclusively over HTTPS | Leave blank for HTTP/LAN      |
| `ENCRYPTION_KEY`      | yes           | 32-byte hex key for crypto                            | `openssl rand -hex 32`        |
| `ADMIN_USERNAME`      | yes (seeding) | First admin account username                          | —                             |
| `ADMIN_PASSWORD`      | yes (seeding) | First admin account password (≥ 8 chars)              | —                             |
| `SCHEDULER_TOKEN`     | no            | Bearer token for `POST /api/cron/resync`              | `openssl rand -hex 32`        |

### 4. Set up the database

Fumadocs `<Tabs>` component with two tabs:

**Tab: Local (Docker)**

- `docker compose up -d`
- Note: spins up Postgres 17 with a named volume (`netroku-pgdata`) for persistence
- `DATABASE_URL` for this setup: `postgresql://netroku:netroku@localhost:5432/netroku?schema=public`

**Tab: External**

- Connection string format: `postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=public`
- Set this as `DATABASE_URL` in `.env`
- Note on firewall: the host running the app must be able to reach the database host on the Postgres port (default 5432)
- Database must already exist; migrations will create all tables

### 5. Apply migrations

```
bun run db:setup   # or: npx prisma migrate deploy && npx prisma generate
```

- Runs `prisma migrate deploy` + `prisma generate`
- Must be re-run after pulling commits that include new migration files

### 6. Seed the admin account

```
bun run seed:admin   # or: npx tsx --env-file=.env prisma/seed-admin.ts
```

- Requires `ADMIN_USERNAME` and `ADMIN_PASSWORD` to be set in `.env`
- One-time operation — creates the first admin user

### 7. Run the app

```
# Development
bun dev   # or: npm run dev

# Production
bun run build && bun start   # or: npm run build && npm start
```

- Development: hot reload, detailed error output
- Production: optimised build, run with `bun start` after build completes

---

## Constraints

- Local deployment only (no cloud/Vercel/bare-metal-without-Docker-for-app)
- Both Bun and Node.js shown equally throughout
- Database: Docker Compose OR external Postgres (tabs, not prose branching)
- No new pages, no meta.json changes
