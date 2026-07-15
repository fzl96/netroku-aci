import * as React from "react";
import { cn } from "@/lib/utils";

// Shared card shell for the mobile (`md:hidden`) representation of a table row.
// Desktop keeps the real <table>; each page maps the same row data into these
// cards, choosing its own 3–4 key fields. Styling matches the app card system.

function DataCard({
  className,
  asChild,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  return (
    <div
      data-slot="data-card"
      className={cn(
        "rounded-2xl border border-border bg-card p-3.5 shadow-sm",
        "transition-colors active:bg-muted/60",
        className,
      )}
      {...props}
    />
  );
}

// Top row: a lead identity (usually mono/emphasised) on the left, and an
// optional badge/meta slot on the right.
function DataCardHeader({
  className,
  children,
  trailing,
  ...props
}: React.ComponentProps<"div"> & { trailing?: React.ReactNode }) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {trailing != null && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

function DataCardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("truncate text-[13px] font-semibold text-foreground", className)}
      {...props}
    />
  );
}

// A single label / value pair. Values truncate; pass a `title` on children if
// the full string matters.
function DataCardRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-xs text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

// Wraps a set of DataCardRow entries with consistent spacing below the header.
function DataCardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-2.5 space-y-1.5", className)} {...props} />;
}

export { DataCard, DataCardHeader, DataCardTitle, DataCardRow, DataCardBody };
