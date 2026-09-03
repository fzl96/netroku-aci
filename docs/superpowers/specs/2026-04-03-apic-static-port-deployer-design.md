# APIC Static Port Mass Deployer — Design Spec

**Date:** 2026-04-03
**Status:** Approved

---

## Overview

A single-page Next.js 16 web app that lets network engineers mass-deploy static port bindings to Cisco APIC via CSV upload. Before deploying, the app performs a per-row safety check against APIC to skip ports that already exist. The UI never touches the EPG object directly — all writes go to the `fvRsPathAtt` (static port) path only.

---

## 1. Architecture

All APIC traffic is proxied through Next.js Route Handlers. The browser never calls APIC directly (avoids CORS issues, keeps credentials out of browser network tabs).

### Route Handlers

| Route | Purpose |
|---|---|
| `POST /api/apic/login` | Forward credentials to APIC `/api/aaaLogin.json`; return token |
| `POST /api/apic/validate` | For each CSV row, GET the static port path on APIC; return per-row status |
| `POST /api/apic/deploy` | POST only `deploy`-status rows to APIC; return per-row result |

### State Management

All state lives in React (`useState`) — no database, no session storage, no persistence. The APIC token and APIC host URL are held in memory only and lost on page refresh. This is intentional for a stateless internal tool.

### Token Flow

1. Client sends APIC host, username, password to `POST /api/apic/login`
2. Route handler calls APIC `/api/aaaLogin.json`, extracts the token from the response
3. Token + APIC host URL are returned to the client and stored in React state
4. For subsequent calls (`/api/apic/validate`, `/api/apic/deploy`), the client sends the token and APIC host in the request body
5. Route handlers forward requests to APIC with the token set as a `Cookie: APIC-cookie={token}` header (standard APIC auth mechanism)

### Client-side responsibilities

- Parse and validate CSV (PapaParse)
- Column header validation and per-cell format checks (before any API call)
- Drive the step progression

---

## 2. CSV Schema

```
tenant,ap,epg,vlan,node1,node2,port_type,interface_or_ipg,mode,immediacy
```

| Column | Type | Rules |
|---|---|---|
| `tenant` | string | Required, non-empty |
| `ap` | string | Required, non-empty |
| `epg` | string | Required, non-empty |
| `vlan` | integer | Required, 1–4094 |
| `node1` | integer | Required |
| `node2` | integer | Required when `port_type=vpc`; must be blank otherwise |
| `port_type` | enum | `vpc`, `pc`, or `port` |
| `interface_or_ipg` | string | Required, non-empty |
| `mode` | enum | `regular`, `native`, or `untagged` |
| `immediacy` | enum | `immediate` or `lazy` |

`pod` is hardcoded to `1` — not a CSV column.

### Port type semantics

| `port_type` | `node2` | `interface_or_ipg` | Used for |
|---|---|---|---|
| `vpc` | required | IPG name | Virtual port-channel across two leaves |
| `pc` | blank | IPG name | Port-channel on a single leaf |
| `port` | blank | Interface name (e.g. `eth1/1`) | Single physical port |

---

## 3. APIC Path Construction

Pod is always `1`.

| `port_type` | APIC path segment |
|---|---|
| `vpc` | `topology/pod-1/protpaths-{node1}-{node2}/pathep-[{interface_or_ipg}]` |
| `pc` | `topology/pod-1/paths-{node1}/pathep-[{interface_or_ipg}]` |
| `port` | `topology/pod-1/paths-{node1}/pathep-[{interface_or_ipg}]` |

Full MO path for a static port binding:

```
/api/node/mo/uni/tn-{tenant}/ap-{ap}/epg-{epg}/rspathAtt-[{path}].json
```

### Safety check (validate route)

`GET` the full MO path. Response cases:

- **`imdata` array is non-empty (MO exists, any encap)** → status `exists` (skip). A path can only have one `fvRsPathAtt` per EPG; deploying would silently overwrite the existing binding, so any existing MO is treated as a conflict regardless of encap.
- **404 or empty `imdata` array** → status `deploy`
- **Any other HTTP error or network failure** → status `error` (with message)

Rows are validated in parallel (up to 10 concurrent requests) to keep the check fast on large CSVs. Deploy rows are also sent in parallel (up to 5 concurrent) to avoid overwhelming APIC.

### Deploy payload

```json
{
  "fvRsPathAtt": {
    "attributes": {
      "dn": "uni/tn-{tenant}/ap-{ap}/epg-{epg}/rspathAtt-[{path}]",
      "encap": "vlan-{vlan}",
      "mode": "{mode}",
      "instrImedcy": "{immediacy}"
    }
  }
}
```

Method: `POST` to the full MO path.

---

## 4. Page Flow (Expanding Sections)

Four sections stacked vertically. Each section expands when active and collapses to a one-line summary when complete. Future sections are visually dimmed.

### Section 1 — Connect

Fields: APIC hostname/IP, username, password.
On submit: POST to `/api/apic/login`. On success, store token in React state and collapse to summary (`● apic.example.com · admin`).
On failure: show inline error message, stay open.

### Section 2 — Upload CSV

Drag-and-drop zone or click-to-select file input.
On file selection: parse with PapaParse, run client-side validation (required headers, VLAN range, enum values, node2 rule). If validation fails, show per-error list inline — do not advance.
On success: collapse to summary (`● 24 rows loaded`).

### Section 3 — Preview & Validate

Triggers automatically when section 2 completes: POST all rows to `/api/apic/validate`.
Shows a loading state during the check (spinner or skeleton rows).

**Validation table columns:** Tenant · AP · EPG · VLAN · Node(s) · Type · Interface/IPG · Mode

**Row status (left border strip):**

| Status | Border color | Row text | Meaning |
|---|---|---|---|
| `deploy` | Green `#16a34a` | Full opacity | Will be deployed |
| `exists` | Amber `#d97706` | Dimmed | Already exists, will skip |
| `error` | Red `#dc2626` | Dimmed | Check failed (APIC error) |

Footer: summary line (`N to deploy · N skipped · N error`) + "Deploy N rows →" button.
The deploy button is disabled if there are zero `deploy`-status rows.

### Section 4 — Deploy

Triggered by "Deploy N rows →" button.
POST `deploy`-status rows to `/api/apic/deploy`. Show per-row live progress (spinner → success / error).
Final tally: `N deployed · N failed`.
Failed rows show the APIC error message inline.
A "Start over" button resets all state.

---

## 5. Visual Design

| Token | Value |
|---|---|
| Background | `#f5f3ef` (warm off-white) |
| Surface (card) | `#ffffff` |
| Border | `#e8e2db` |
| Text primary | `#1a1814` |
| Text secondary | `#a89b8f` |
| Accent / CTA | `#cf6600` (warm orange) |
| Success | `#16a34a` |
| Warning (exists) | `#d97706` |
| Error | `#dc2626` |
| Heading font | Lora (serif), weights 400/500/600 |
| Body / UI font | Inter (sans-serif) |

Mode: **light only** (no dark mode toggle needed for an internal tool).

---

## 6. Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI components | shadcn/ui + Tailwind CSS |
| CSV parsing | PapaParse |
| Fonts | Google Fonts — Lora + Inter |
| State | React `useState` only |
| API | Next.js Route Handlers (3 routes) |

The page (`app/page.tsx`) is a Client Component (`'use client'`). Route handlers live in `app/api/apic/`.

---

## 7. Error Handling

| Scenario | Behavior |
|---|---|
| APIC login fails | Inline error in Connect section; token not stored |
| CSV has wrong headers | Per-error list shown in Upload section; no API calls |
| Validate request fails entirely | Toast/banner error; user can retry |
| Individual row check fails | Row marked `error`; rest of batch continues |
| Deploy request fails entirely | Toast/banner error; user can retry |
| Individual row deploy fails | Row marked failed with APIC error message; rest continue |
| APIC token expires mid-session | 401 response triggers inline prompt to reconnect |

---

## 8. Security Notes

- APIC credentials are never logged or stored — passed through in-memory only
- The APIC token is held in React state and never written to `localStorage` or cookies
- Route handlers validate that a token is present before forwarding to APIC
- No user data is persisted server-side
- APIC commonly uses self-signed TLS certificates; route handlers use a custom `fetch`/`https.Agent` with `rejectUnauthorized: false` for APIC calls only (standard for internal APIC tooling)
- The APIC host URL is validated server-side (must be HTTPS, no path traversal) before forwarding requests
