# Admin & Setup Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write complete MDX content for `content/docs/admin/index.mdx` (overview + prerequisites) and `content/docs/admin/deployment.mdx` (full local setup guide with Docker/external database tabs).

**Architecture:** Two MDX files edited in place. `Tabs`/`Tab` imported from `fumadocs-ui/components/tabs` in deployment.mdx. `Callout` is globally available via `defaultMdxComponents` — no import needed. No routing or config changes required.

**Tech Stack:** Fumadocs UI v16, fumadocs-mdx v15, Next.js, MDX

## Global Constraints

- App deployment: local only (no cloud, no bare-metal non-Docker app)
- Both Bun and Node.js shown as equal alternatives in every step that has diverging commands
- Database section uses `<Tabs>` component (not prose branching) for Local (Docker) vs External
- `Tabs`/`Tab` must be imported in each MDX file that uses them; `Callout` does not need importing
- No new pages, no changes to `meta.json`
- `ENCRYPTION_KEY` is a required env var (present in `.env.example`, missing from README table — include it)

---

### Task 1: Write `index.mdx` — Admin & Setup overview

**Files:**
- Modify: `content/docs/admin/index.mdx`

**Interfaces:**
- Produces: A short overview page with prerequisites checklist and links to sub-pages. No components imported.

- [ ] **Step 1: Write the file**

Replace the entire contents of `content/docs/admin/index.mdx` with:

```mdx
---
title: Admin & Setup
description: Deployment, configuration, and user management.
---

This section covers everything needed to deploy and configure Netroku ACI — from first-time setup to managing users and scheduled syncs.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Bun** ≥ 1.1 ([bun.sh](https://bun.sh)) **or** **Node.js** ≥ 20 ([nodejs.org](https://nodejs.org))
- **Git**
- **Docker** with Docker Compose — only required if you plan to run the database locally

## What's in this section

- [Deployment](/docs/admin/deployment) — install dependencies, configure environment variables, set up the database, and run the app
- [APIC Hosts](/docs/admin/apic-hosts) — add and manage the Cisco APIC controllers Netroku ACI connects to
- [Scheduled Resync](/docs/admin/scheduled-resync) — configure automatic data synchronisation to keep endpoint and fabric data current
- [Users](/docs/admin/users) — create user accounts and manage role-based access
```

- [ ] **Step 2: Verify renders — start dev server and open the page**

```bash
bun dev
```

Open [http://localhost:3000/docs/admin](http://localhost:3000/docs/admin). Confirm:
- Heading: "Admin & Setup"
- Three prerequisite bullet points visible
- Four links in "What's in this section" all render as clickable links

Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 3: Commit**

```bash
git add content/docs/admin/index.mdx
git commit -m "docs(admin): write Admin & Setup overview page"
```

---

### Task 2: Write `deployment.mdx` — full deployment guide

**Files:**
- Modify: `content/docs/admin/deployment.mdx`

**Interfaces:**
- Consumes: `Tabs`, `Tab` from `fumadocs-ui/components/tabs` (imported in file). `Callout` from global `defaultMdxComponents` (no import).
- Produces: Seven-section deployment guide with runtime tabs, env var table, database tabs, and runtime-switching code blocks throughout.

- [ ] **Step 1: Write the file**

Replace the entire contents of `content/docs/admin/deployment.mdx` with:

```mdx
---
title: Deployment
description: How to deploy Netroku ACI.
---

import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

Netroku ACI is a Next.js application backed by a PostgreSQL database. The app runs locally; the database can run in Docker or connect to an existing PostgreSQL instance.

## 1. Install a runtime

<Tabs items={['Bun (recommended)', 'Node.js']}>
  <Tab>

Install Bun from [bun.sh](https://bun.sh), then verify:

```bash
bun --version
```

<Callout type="warn" title="Windows users">
Bun has a known compatibility issue with the TLS bypass used for self-signed APIC certificates. Use **WSL2** or Node.js instead.
</Callout>

  </Tab>
  <Tab>

Install Node.js 20+ from [nodejs.org](https://nodejs.org), then verify:

```bash
node --version
```

  </Tab>
</Tabs>

## 2. Clone the repository

```bash
git clone <repo-url> netroku-aci
cd netroku-aci
```

Install dependencies:

<Tabs items={['Bun', 'Node.js']}>
  <Tab>

```bash
bun install
```

  </Tab>
  <Tab>

```bash
npm install
```

  </Tab>
</Tabs>

## 3. Configure environment

Copy the example env file:

```bash
cp .env.example .env
```

Open `.env` and fill in the values:

| Variable | Required | Purpose | How to set |
|---|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string | See [Set up the database](#4-set-up-the-database) below |
| `BETTER_AUTH_SECRET` | yes | Session signing secret | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | yes | Base URL the app is served from | e.g. `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL used by the browser | e.g. `http://localhost:3000` |
| `TRUSTED_ORIGINS` | yes | Comma-separated origins Better Auth accepts | Add LAN IPs or Tailscale hosts as needed |
| `SECURE_COOKIES` | no | Set to `true` only when served exclusively over HTTPS | Leave blank for HTTP/LAN |
| `ENCRYPTION_KEY` | yes | 32-byte hex key for encrypted fields | `openssl rand -hex 32` |
| `ADMIN_USERNAME` | yes (seeding) | Username for the first admin account | — |
| `ADMIN_PASSWORD` | yes (seeding) | Password for the first admin account (≥ 8 chars) | — |
| `SCHEDULER_TOKEN` | no | Bearer token for `POST /api/cron/resync` | `openssl rand -hex 32` |

## 4. Set up the database

<Tabs items={['Local (Docker)', 'External']}>
  <Tab>

The included Docker Compose file starts a PostgreSQL 17 instance with a named volume for persistence.

```bash
docker compose up -d
```

Set `DATABASE_URL` in your `.env` to:

```env
DATABASE_URL="postgresql://netroku:netroku@localhost:5432/netroku?schema=public"
```

  </Tab>
  <Tab>

If you have an existing PostgreSQL instance, set `DATABASE_URL` in `.env` using this format:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=public"
```

For example:

```env
DATABASE_URL="postgresql://admin:s3cr3t@db.internal:5432/netroku?schema=public"
```

<Callout type="info" title="Network access">
The machine running the app must be able to reach your database host on the PostgreSQL port (default 5432). The database itself must already exist — migrations will create all tables.
</Callout>

  </Tab>
</Tabs>

## 5. Apply migrations

Run migrations and generate the Prisma client:

<Tabs items={['Bun', 'Node.js']}>
  <Tab>

```bash
bun run db:setup
```

  </Tab>
  <Tab>

```bash
npx prisma migrate deploy && npx prisma generate
```

  </Tab>
</Tabs>

This creates all database tables from the committed migration files. Re-run after pulling commits that include new migration files.

## 6. Seed the admin account

Make sure `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set in `.env`, then run:

<Tabs items={['Bun', 'Node.js']}>
  <Tab>

```bash
bun run seed:admin
```

  </Tab>
  <Tab>

```bash
npx tsx --env-file=.env prisma/seed-admin.ts
```

  </Tab>
</Tabs>

This is a one-time operation that creates the first admin user. Use this account to log in and manage other users from the app.

## 7. Run the app

<Tabs items={['Development', 'Production']}>
  <Tab>

<Tabs items={['Bun', 'Node.js']}>
  <Tab>

```bash
bun dev
```

  </Tab>
  <Tab>

```bash
npm run dev
```

  </Tab>
</Tabs>

Hot reload and detailed error output. The app is available at [http://localhost:3000](http://localhost:3000).

  </Tab>
  <Tab>

<Tabs items={['Bun', 'Node.js']}>
  <Tab>

```bash
bun run build && bun start
```

  </Tab>
  <Tab>

```bash
npm run build && npm start
```

  </Tab>
</Tabs>

Build first, then start. The app will be available at the URL set in `BETTER_AUTH_URL`.

  </Tab>
</Tabs>
```

- [ ] **Step 2: Verify renders — start dev server and open the page**

```bash
bun dev
```

Open [http://localhost:3000/docs/admin/deployment](http://localhost:3000/docs/admin/deployment). Confirm:
- All seven H2 sections visible in the page and TOC
- Section 1: Two tabs ("Bun (recommended)" / "Node.js") switch correctly; Windows callout visible in Bun tab
- Section 3: Env var table renders with 10 rows
- Section 4: Two tabs ("Local (Docker)" / "External"); Callout visible in External tab
- Sections 5 & 6: Two tabs each ("Bun" / "Node.js")
- Section 7: Nested tabs (Dev/Prod outer, Bun/Node.js inner) all switch correctly

Stop the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add content/docs/admin/deployment.mdx
git commit -m "docs(admin): write deployment guide with Docker and external DB options"
```
