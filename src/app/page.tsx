"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { nextBinaryTheme } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  IconArrowUpRight,
  IconCheck,
  IconChevronRight,
  IconCircleFilled,
  IconMoon,
  IconRotate2,
  IconShieldCheck,
  IconSun,
  IconTerminal2,
  IconUpload,
} from "@tabler/icons-react";

// ─── Theme toggle ──────────────────────────────────────────────────────────
function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme((t) => nextBinaryTheme(t))}
      className={cn(
        "group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/60 text-foreground/80 backdrop-blur transition-colors hover:text-foreground hover:border-foreground/30",
        className,
      )}
    >
      <IconMoon size={15} stroke={1.6} className="block dark:hidden" />
      <IconSun size={15} stroke={1.6} className="hidden dark:block" />
    </button>
  );
}

// ─── Decorative atmosphere ─────────────────────────────────────────────────
function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Hairline grid */}
      <div
        className="absolute inset-0 opacity-[0.45] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border-light) 1px, transparent 1px), linear-gradient(to bottom, var(--border-light) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%)",
        }}
      />
      {/* Warm bloom (light) / cool bloom (dark) */}
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--primary) 22%, transparent), transparent 70%)",
        }}
      />
      {/* Bottom horizon line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border-light" />
    </div>
  );
}

// ─── Logo placeholder ──────────────────────────────────────────────────────
function LogoMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/brand-icon.png"
        alt=""
        aria-hidden
        width={36}
        height={36}
        className="h-9 w-9 dark:invert"
        priority
      />
      <span className="font-serif text-[17px] font-medium tracking-tight">
        Netroku
        <span className="text-muted-foreground">/aci</span>
      </span>
    </span>
  );
}

// ─── Navigation ────────────────────────────────────────────────────────────
function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-light bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <LogoMark />
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex">
          <a href="#workflows" className="transition-colors hover:text-foreground">
            Workflows
          </a>
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#safety" className="transition-colors hover:text-foreground">
            Safety
          </a>
          <a
            href="https://github.com"
            className="transition-colors hover:text-foreground"
          >
            Docs
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/signin"
            className="hidden text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-[13px] font-medium text-background transition-all hover:opacity-90"
          >
            Open dashboard
            <IconArrowUpRight
              size={13}
              stroke={2}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── CSV preview card (hero anchor) ────────────────────────────────────────
const CSV_ROWS: Array<{
  tenant: string;
  epg: string;
  vlan: string;
  port: string;
  status: "ok" | "queue" | "deploy";
}> = [
  { tenant: "serverfarm", epg: "VLAN1411_EPG", vlan: "1411", port: "vpc/3101-2", status: "ok" },
  { tenant: "serverfarm", epg: "VLAN1412_EPG", vlan: "1412", port: "vpc/3101-2", status: "ok" },
  { tenant: "TenantB", epg: "Front-EPG", vlan: "300", port: "pc/Bundle-101", status: "deploy" },
  { tenant: "TenantA", epg: "Mgmt-EPG", vlan: "999", port: "port/1-10", status: "queue" },
  { tenant: "TenantA", epg: "Web-EPG", vlan: "420", port: "vpc/3201-2", status: "ok" },
];

function StatusDot({ status }: { status: "ok" | "queue" | "deploy" }) {
  const map = {
    ok: "bg-success",
    queue: "bg-warning",
    deploy: "bg-primary",
  } as const;
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      <span
        className={cn(
          "absolute inset-0 rounded-full opacity-70 motion-safe:animate-ping",
          map[status],
        )}
      />
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", map[status])} />
    </span>
  );
}

function CsvPreviewCard() {
  return (
    <div className="relative">
      {/* Soft shadow plate */}
      <div
        aria-hidden
        className="absolute -inset-x-3 -inset-y-3 rounded-2xl bg-foreground/[0.03] dark:bg-foreground/[0.04]"
      />
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_0_0_var(--border-light),0_24px_60px_-30px_color-mix(in_oklch,var(--foreground)_25%,transparent)]">
        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-border-light bg-muted/50 px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <IconTerminal2 size={13} stroke={1.75} />
            <span className="font-mono">static-ports.csv</span>
            <span className="text-faint">·</span>
            <span className="font-mono text-faint">12 rows · validated</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-bg px-1.5 py-0.5 text-[10px] font-medium text-success-text">
            <IconCheck size={10} stroke={2.5} />
            APIC connected
          </span>
        </div>
        {/* Column header */}
        <div className="grid grid-cols-[1.2fr_1.4fr_0.6fr_1.4fr_0.4fr] gap-3 border-b border-border-light bg-background/40 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-faint">
          <span>tenant</span>
          <span>epg</span>
          <span>vlan</span>
          <span>port</span>
          <span className="text-right">·</span>
        </div>
        {/* Rows */}
        <ul className="divide-y divide-border-light">
          {CSV_ROWS.map((row, i) => (
            <li
              key={i}
              className="grid grid-cols-[1.2fr_1.4fr_0.6fr_1.4fr_0.4fr] items-center gap-3 px-4 py-2.5 font-mono text-[11.5px] text-foreground/85 transition-colors hover:bg-muted/40"
              style={{
                animation: "fade-up 0.5s ease-out both",
                animationDelay: `${300 + i * 80}ms`,
              }}
            >
              <span className="truncate">{row.tenant}</span>
              <span className="truncate text-foreground">{row.epg}</span>
              <span className="text-muted-foreground">{row.vlan}</span>
              <span className="truncate text-muted-foreground">{row.port}</span>
              <span className="flex justify-end">
                <StatusDot status={row.status} />
              </span>
            </li>
          ))}
        </ul>
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-light bg-muted/40 px-4 py-2.5 text-[11px]">
          <span className="font-mono text-faint">
            <span className="text-muted-foreground">parallel</span> 10
            <span className="text-muted-foreground"> · deploy</span> 5
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-foreground">
            <span className="h-1 w-1 rounded-full bg-primary" />
            ready to deploy
          </span>
        </div>
      </div>

      {/* Floating note */}
      <div
        className="absolute -bottom-4 -right-3 hidden rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground shadow-lg sm:flex sm:items-center sm:gap-1.5"
        style={{ animation: "fade-up 0.6s ease-out 0.9s both" }}
      >
        <IconRotate2 size={11} stroke={1.75} />
        rollback uses same csv
      </div>
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <GridBackdrop />
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left — copy */}
          <div className="flex flex-col">
            <div
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur"
              style={{ animation: "fade-up 0.5s ease-out both" }}
            >
              <IconCircleFilled size={6} className="text-primary" />
              <span className="font-mono uppercase tracking-wider">
                v1.0 · cisco aci toolkit
              </span>
            </div>
            <h1
              className="mt-6 font-serif text-[44px] leading-[1.04] tracking-[-0.02em] text-foreground sm:text-[56px] lg:text-[64px]"
              style={{ animation: "fade-up 0.6s ease-out 0.1s both" }}
            >
              Ship fabric policy.
              <br />
              <span className="italic text-muted-foreground">From a </span>
              <span className="relative inline-block">
                <span className="relative z-10">spreadsheet.</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-primary/15 dark:bg-foreground/10"
                />
              </span>
            </h1>
            <p
              className="mt-7 max-w-md text-[15px] leading-relaxed text-muted-foreground"
              style={{ animation: "fade-up 0.6s ease-out 0.2s both" }}
            >
              Bulk deploy and rollback Cisco ACI access policy, bridge domains,
              EPGs, and static port bindings — without ever opening the APIC
              GUI. Validate first. Deploy in parallel. Undo with the same file.
            </p>
            <div
              className="mt-9 flex flex-wrap items-center gap-3"
              style={{ animation: "fade-up 0.6s ease-out 0.3s both" }}
            >
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13.5px] font-medium text-background transition-all hover:opacity-90"
              >
                Open dashboard
                <IconArrowUpRight
                  size={14}
                  stroke={2}
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
              <a
                href="#workflows"
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-5 py-2.5 text-[13.5px] font-medium text-foreground backdrop-blur transition-colors hover:border-foreground/30"
              >
                See workflows
                <IconChevronRight
                  size={14}
                  stroke={2}
                  className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </div>
            {/* Mini stats row */}
            <dl
              className="mt-12 grid grid-cols-3 gap-6 border-t border-border-light pt-6"
              style={{ animation: "fade-up 0.6s ease-out 0.4s both" }}
            >
              {[
                { v: "10×", l: "parallel validate" },
                { v: "5×", l: "concurrent deploy" },
                { v: "0", l: "gui clicks" },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="font-serif text-2xl text-foreground">{s.v}</dt>
                  <dd className="mt-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">
                    {s.l}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right — CSV preview */}
          <div style={{ animation: "fade-up 0.7s ease-out 0.25s both" }}>
            <CsvPreviewCard />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Workflows ─────────────────────────────────────────────────────────────
const WORKFLOWS = [
  {
    n: "01",
    name: "Static Ports",
    desc: "Bulk fvRsPathAtt bindings with VLAN encap collision checks.",
  },
  {
    n: "02",
    name: "Interface Selectors",
    desc: "Per-port infraHPortS + infraPortBlk with IPG type validation.",
  },
  {
    n: "03",
    name: "Bridge Domains",
    desc: "L2-only and L3 fvBD with subnet and L3Out attachment in one row.",
  },
  {
    n: "04",
    name: "EPGs + Contracts",
    desc: "Create fvAEPg under existing ANPs; consumed and provided contracts attached idempotently.",
  },
  {
    n: "05",
    name: "Endpoint Search",
    desc: "Search live endpoints across the fabric with cascading filters and export.",
  },
  {
    n: "06",
    name: "Interface Health",
    desc: "Live counter mode with natural sort, node filter, and CRC + drop telemetry.",
  },
];

function Workflows() {
  return (
    <section
      id="workflows"
      className="relative border-t border-border-light bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <div className="mb-10 flex items-end justify-between gap-8">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
              · Workflows
            </p>
            <h2 className="mt-3 max-w-xl font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Every workflow ships with a{" "}
              <span className="italic text-muted-foreground">rollback</span>.
            </h2>
          </div>
          <p className="hidden max-w-xs text-[13px] text-muted-foreground md:block">
            Six bulk operations covering the policy surface area you actually
            touch on Monday morning.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {WORKFLOWS.map((w) => (
            <li
              key={w.n}
              className="group relative flex flex-col gap-3 bg-card p-7"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10.5px] tracking-wider text-faint">
                  {w.n}
                </span>
                <IconArrowUpRight
                  size={14}
                  stroke={1.75}
                  className="text-faint opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground group-hover:opacity-100"
                />
              </div>
              <h3 className="font-serif text-xl text-foreground">{w.name}</h3>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                {w.desc}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── How it works ──────────────────────────────────────────────────────────
const STEPS = [
  {
    n: "I",
    icon: IconUpload,
    title: "Drop the CSV",
    body: "Drag a spreadsheet onto any workflow. Schema is enforced on the client before a single byte leaves the browser.",
  },
  {
    n: "II",
    icon: IconShieldCheck,
    title: "Validate against APIC",
    body: "Ten parallel checks per row hit your APIC controller — tenant, EPG, BD, contract, VLAN collisions — surfaced inline.",
  },
  {
    n: "III",
    icon: IconRotate2,
    title: "Deploy or roll back",
    body: "Push five rows at a time. The same file you deployed undeploys you cleanly when something upstream changes.",
  },
];

function HowItWorks() {
  return (
    <section
      id="how"
      className="relative border-t border-border-light bg-muted/30"
    >
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
        <div className="mb-14 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
              · The loop
            </p>
            <h2 className="mt-3 max-w-2xl font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Three steps. <span className="italic text-muted-foreground">No surprises.</span>
            </h2>
          </div>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border-light sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className="relative flex flex-col gap-5 bg-card p-8"
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-3xl italic text-muted-foreground/70">
                  {s.n}
                </span>
                <s.icon
                  size={18}
                  stroke={1.5}
                  className="text-foreground/80"
                />
              </div>
              <h3 className="font-serif text-xl text-foreground">{s.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                {s.body}
              </p>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground sm:flex"
                >
                  <IconChevronRight size={10} stroke={2} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── Safety / Rollback ─────────────────────────────────────────────────────
function Safety() {
  const bullets = [
    "APIC session tokens held in React state — never written to cookies or localStorage.",
    "Idempotent deploys: rows that already exist are skipped, never duplicated.",
    "Rollback validation surfaces drift between the file and the live fabric before anything is removed.",
    "Self-signed APIC TLS bypass is opt-in and isolated to the route handler.",
  ];

  return (
    <section
      id="safety"
      className="relative border-t border-border-light bg-background"
    >
      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 sm:py-28 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            · Safety model
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Built for{" "}
            <span className="italic text-muted-foreground">
              the change window
            </span>{" "}
            you actually have.
          </h2>
          <p className="mt-6 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Every action is reversible. Every error is local. Nothing leaves
            the browser until you&rsquo;ve seen the validation pass.
          </p>
        </div>

        <ul className="divide-y divide-border-light border-y border-border-light">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-5 py-5">
              <span className="mt-0.5 font-mono text-[10.5px] tracking-wider text-faint">
                0{i + 1}
              </span>
              <span className="flex-1 text-[14px] leading-relaxed text-foreground/85">
                {b}
              </span>
              <IconCheck
                size={14}
                stroke={2}
                className="mt-1 shrink-0 text-primary"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── CTA ───────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section className="relative border-t border-border-light bg-muted/40">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
          · Begin
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl font-serif text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Stop clicking through the APIC GUI.{" "}
          <span className="italic text-muted-foreground">
            Start shipping policy.
          </span>
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-[14px] font-medium text-background transition-all hover:opacity-90"
          >
            Open the dashboard
            <IconArrowUpRight
              size={15}
              stroke={2}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3 text-[14px] font-medium text-foreground backdrop-blur transition-colors hover:border-foreground/30"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-border-light bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <LogoMark />
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">
            built for network engineers
          </span>
        </div>
        <div className="flex items-center gap-6 text-[12.5px] text-muted-foreground">
          <a href="#workflows" className="transition-colors hover:text-foreground">
            Workflows
          </a>
          <a href="#how" className="transition-colors hover:text-foreground">
            Loop
          </a>
          <a href="#safety" className="transition-colors hover:text-foreground">
            Safety
          </a>
          <span className="font-mono text-faint">
            © {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main>
        <Hero />
        <Workflows />
        <HowItWorks />
        <Safety />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
