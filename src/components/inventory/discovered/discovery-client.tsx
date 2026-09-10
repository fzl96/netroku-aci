'use client'
import { useRef, useState, useTransition } from 'react'
import { serialKey } from '@/lib/inventory/sources/identity'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconAlertTriangle, IconChevronDown, IconSearch, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { FooterCancel, FooterSubmit } from '@/components/inventory/dialog-footer-buttons'
import { linkSources, unlinkSource } from '@/lib/inventory/sources/actions'
import type { LinkInput } from '@/lib/inventory/sources/mutation'
import type { DiscoveryData } from '@/lib/inventory/sources/query'
import { discoveryGroups } from '@/lib/inventory/sources/groups'
import { fmtDate, fmtRelative } from '@/lib/interface-health/format'
import {
  DENSE_TABLE_HEAD_CLS,
  INPUT_OVERRIDE_CLS,
  SEARCH_INPUT_CLS,
  SELECT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import { cn } from '@/lib/utils'
import { DiscoveryHeader } from './discovery-header'
import {
  blocker,
  initialDraft,
  selectionConflict,
  rowKey,
  type Row,
  type Draft,
  type Group,
} from './batch-model'

const fieldCls = cn(INPUT_OVERRIDE_CLS, 'h-9')
const selectCls = cn(SELECT_CLS, 'h-9 py-0')
const cellInputCls = cn(INPUT_OVERRIDE_CLS, 'h-8 text-xs')
const sheetCls =
  'flex w-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl data-[side=right]:sm:max-w-2xl'
const warningText = 'text-(--warning-text)'
// The base checkbox is borderless-looking on muted surfaces; give it an edge and a fill.
const checkboxCls = 'border-muted-foreground/45 bg-card shadow-xs'
const kindLabel = (kind: Row['kind']) => (kind === 'LEGACY' ? 'Legacy' : 'ACI')
const mergeById = <T extends { id: string }>(old: T[], next: T[]) => [
  ...new Map([...old, ...next].map((v) => [v.id, v])).values(),
]

function ChangeTable({ changes }: { changes: [field: string, from: string, to: string][] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {changes.map(([field, from, to]) => (
          <tr key={field}>
            <th scope="row" className="w-20 py-1 pr-3 text-left align-top font-normal text-subtle">
              {field}
            </th>
            <td className="py-1 pr-2 align-top text-muted-foreground">{from}</td>
            <td className="w-5 py-1 align-top text-faint">
              <span aria-hidden>→</span>
              <span className="sr-only">becomes</span>
            </td>
            <td
              className={cn(
                'py-1 align-top',
                from === to ? 'text-muted-foreground' : 'font-medium text-foreground',
              )}
            >
              {to}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RefreshStatus({
  health,
  healthy,
  admin,
}: {
  health: DiscoveryData['health']
  healthy: boolean
  admin: boolean
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 w-fit items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            healthy
              ? 'border-border bg-card text-muted-foreground hover:text-foreground'
              : cn('border-warning-border bg-warning-bg', warningText),
          )}
        >
          <span
            aria-hidden
            className={cn('size-1.5 rounded-full', healthy ? 'bg-success-dot' : 'bg-warning')}
          />
          {healthy ? 'Automatic refresh active' : 'Automatic refresh needs attention'}
          {health.pending > 0 && (
            <span className="font-normal tabular-nums opacity-80">{health.pending} pending</span>
          )}
          <IconChevronDown size={12} stroke={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-4">
        <div>
          <p className="font-medium text-foreground">{health.state}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Linked assets pick up new discovery values in the background.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-subtle">Pending</dt>
          <dd className="tabular-nums">{health.pending}</dd>
          <dt className="text-subtle">Retrying</dt>
          <dd className="tabular-nums">{health.failed}</dd>
          <dt className="text-subtle">Last completion</dt>
          <dd>{fmtDate(health.lastCompletedAt)}</dd>
          {health.oldest && (
            <>
              <dt className="text-subtle">Oldest pending</dt>
              <dd>{fmtDate(health.oldest)}</dd>
            </>
          )}
        </dl>
        {health.error && (
          <p className="rounded-md bg-error-bg px-2.5 py-2 font-mono text-[11px] break-words text-(--error-text)">
            {health.error}
          </p>
        )}
        {!healthy && (
          <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {admin
              ? 'Configure SCHEDULER_TOKEN and start the scheduler service; check its logs and heartbeat.'
              : 'Contact an administrator to check automatic refresh.'}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function DiscoveryClient({ data }: { data: DiscoveryData }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [cache, setCache] = useState<Record<string, Row>>({})
  const [devices, setDevices] = useState(data.devices)
  const [stacks, setStacks] = useState(data.stacks)
  const [previousData, setPreviousData] = useState(data)
  const [attestation, setAttestation] = useState(false)
  const [sharedVendor, setSharedVendor] = useState('')
  const [sharedHeight, setSharedHeight] = useState('')
  const [results, setResults] = useState<Record<string, string>>({})
  const [completed, setCompleted] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  // The server groups every matching discovery; rows are already the selected group's page.
  const group = data.group
  const [editor, setEditor] = useState<string | null>(null)
  const [review, setReview] = useState(false)
  const [busy, start] = useTransition()
  // Preserve drafts and selected observations across route updates, including source filters.
  // Refreshed observations replace cached values; the server still verifies their review token.
  if (data !== previousData) {
    setPreviousData(data)
    setDevices(mergeById(devices, data.devices))
    setStacks(mergeById(stacks, data.stacks))
    setCache((old) => ({
      ...old,
      ...Object.fromEntries(
        data.rows.map((r) => {
          const row = { ...r, kind: data.kind }
          return [rowKey(row), row]
        }),
      ),
    }))
  }
  const rows: Row[] = data.rows.map((r) => ({ ...r, kind: data.kind }))
  const known = { ...cache, ...Object.fromEntries(rows.map((r) => [rowKey(r), r])) }
  const chosen = selected.flatMap((id) => (known[id] ? [known[id]] : []))
  const draft = (row: Row) => drafts[rowKey(row)] ?? initialDraft(row)
  function patch(row: Row, value: Partial<Draft>) {
    setDrafts((old) => ({
      ...old,
      [rowKey(row)]: { ...(old[rowKey(row)] ?? initialDraft(row)), ...value },
    }))
    if (value.mode) setAttestation(false)
    setResults((old) => ({ ...old, [rowKey(row)]: '' }))
  }
  function selectRows(items: Row[]) {
    setCache((old) => ({ ...old, ...Object.fromEntries(items.map((r) => [rowKey(r), r])) }))
    setSelected((old) => [...new Set([...old, ...items.map(rowKey)])])
    setAttestation(false)
  }
  function issue(row: Row) {
    const d = draft(row)
    const problem = blocker(row, d, devices, stacks)
    if (problem) return problem
    return selectionConflict(row, draft, chosen)
  }
  const ready = chosen.filter((row) => !issue(row))
  const batch = ready.slice(0, 50)
  const chosenCreate = chosen.filter((row) => draft(row).mode === 'CREATE')
  const visible = rows.filter((row) => group === 'Linked' || !completed.includes(rowKey(row)))
  const selectable = visible.filter(
    (row) => row.present && !row.link && !row.conflict && !row.reserved,
  )
  const allSelected =
    selectable.length > 0 && selectable.every((row) => selected.includes(rowKey(row)))
  const showCreate = visible.some((row) => draft(row).mode === 'CREATE' && !row.link)
  const legacyPhysical = ready.some((row) => row.kind === 'LEGACY' && draft(row).mode !== 'STACK')
  const healthy =
    data.health.state.startsWith('Worker healthy') || data.health.state.startsWith('Worker running')
  const pages = Math.max(1, Math.ceil(data.total / 25))
  const editing = editor ? known[editor] : undefined
  function navigate(params: URLSearchParams) {
    start(() => router.push(`/inventory/discovered?${params}`))
  }
  // Omitting the group lets the server open the first group that has discoveries.
  function search(kind: string, group?: Group) {
    const values = formRef.current ? new FormData(formRef.current) : null
    navigate(
      new URLSearchParams({
        kind,
        q: String(values?.get('q') ?? data.q),
        assetq: String(values?.get('assetq') ?? data.assetq),
        ...(group ? { group } : {}),
      }),
    )
  }
  function save() {
    start(async () => {
      const inputs: LinkInput[] = batch.map((row) => {
        const d = draft(row)
        return {
          kind: row.kind,
          sourceId: row.id,
          reviewToken: row.reviewToken,
          target: d.mode === 'STACK' ? 'STACK' : 'DEVICE',
          targetId: d.mode === 'CREATE' ? undefined : d.targetId || undefined,
          singleChassis: attestation,
          replaceSourceId: d.relink
            ? (row.link?.id ??
              (d.mode === 'STACK'
                ? stacks.find((s) => s.id === d.targetId)?.source?.id
                : devices.find((s) => s.id === d.targetId)?.source?.id))
            : undefined,
          ...(d.mode === 'STACK' ? { stackName: d.stackName, memberIds: d.memberIds } : {}),
          ...(d.mode === 'CREATE'
            ? {
                device: {
                  name: d.name,
                  serialNumber: d.serialNumber,
                  model: d.model,
                  version: row.version,
                  vendor: d.vendor,
                  heightU: Number(d.height),
                  assetTag: d.assetTag || null,
                  status: 'ACTIVE' as const,
                },
              }
            : {}),
        }
      })
      try {
        const outcomes = await linkSources(inputs)
        const successful = outcomes.flatMap((o, i) => (o.success ? [rowKey(batch[i])] : []))
        setResults((old) => ({
          ...old,
          ...Object.fromEntries(
            outcomes.map((o, i) => [rowKey(batch[i]), o.success ? '' : o.error]),
          ),
        }))
        setSelected((old) => old.filter((id) => !successful.includes(id)))
        setCompleted((old) => [...old, ...successful])
        setNotice(
          `${successful.length} imported. ${outcomes.length - successful.length} failed.${ready.length > 50 ? ' Review the remaining selection for the next batch.' : ''}`,
        )
        setReview(false)
        setAttestation(false)
        router.refresh()
      } catch {
        setNotice(
          'Import interrupted. Refresh to check completed links before retrying. Your selection and edits are retained.',
        )
      }
    })
  }
  return (
    <>
      <DiscoveryHeader
        actions={<RefreshStatus health={data.health} healthy={healthy} admin={data.admin} />}
      />
      <main className="space-y-4 px-4 py-4 pb-28 md:px-8 md:py-6 md:pb-28">
        <form
          ref={formRef}
          key={`${data.kind}:${data.q}:${data.assetq}`}
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) search(data.kind, group)
          }}
        >
          <div
            role="group"
            aria-label="Discovery source"
            className="inline-flex h-8 rounded-lg border border-border bg-muted p-0.5"
          >
            {(['ACI', 'LEGACY'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={data.kind === kind}
                disabled={busy}
                onClick={() => data.kind !== kind && search(kind)}
                className={cn(
                  'rounded-md px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  data.kind === kind
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {kindLabel(kind)}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <IconSearch
              size={13}
              stroke={1.75}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
            />
            <input
              name="q"
              aria-label="Search discoveries"
              defaultValue={data.q}
              placeholder="Hostname or serial"
              className={cn(SEARCH_INPUT_CLS, 'h-8')}
            />
          </div>
          <div className="relative w-full sm:w-64">
            <IconSearch
              size={13}
              stroke={1.75}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
            />
            <input
              name="assetq"
              aria-label="Find inventory targets"
              defaultValue={data.assetq}
              placeholder="Find asset or stack targets"
              className={cn(SEARCH_INPUT_CLS, 'h-8')}
            />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            Search
          </Button>
        </form>

        {notice && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm"
          >
            <p>{notice}</p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setNotice('')}
            >
              <IconX />
            </Button>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border px-2">
            <div className="flex overflow-x-auto" aria-label="Discovery groups">
              {discoveryGroups.map((label) => {
                const count = data.counts[label]
                const active = group === label
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => !active && search(data.kind, label)}
                    className={cn(
                      '-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:bg-muted',
                      active
                        ? 'border-primary font-medium text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums',
                        label === 'Needs attention' && count > 0
                          ? cn('bg-warning-bg', warningText)
                          : active
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="hidden shrink-0 px-2 text-xs text-subtle lg:block">
              Selections carry across groups, pages, and filters.
            </p>
          </div>

          {visible.length ? (
            <div className={cn(TABLE_SCROLL_CLS, 'transition-opacity', busy && 'opacity-60')}>
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr>
                    <th className={cn(DENSE_TABLE_HEAD_CLS, 'w-10 pr-0 align-middle')}>
                      <Checkbox
                        className={checkboxCls}
                        aria-label="Select all eligible devices on this page"
                        checked={allSelected}
                        disabled={!data.admin || busy || !selectable.length}
                        onCheckedChange={() =>
                          allSelected
                            ? setSelected((old) =>
                                old.filter((id) => !selectable.some((r) => rowKey(r) === id)),
                              )
                            : selectRows(selectable)
                        }
                      />
                    </th>
                    <th className={DENSE_TABLE_HEAD_CLS}>Discovered device</th>
                    <th className={DENSE_TABLE_HEAD_CLS}>Model</th>
                    <th className={DENSE_TABLE_HEAD_CLS}>Proposed action</th>
                    {showCreate && <th className={DENSE_TABLE_HEAD_CLS}>New device details</th>}
                    <th className={DENSE_TABLE_HEAD_CLS}>Last received</th>
                    <th className={DENSE_TABLE_HEAD_CLS}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const d = draft(row),
                      key = rowKey(row),
                      target = devices.find((v) => v.id === d.targetId),
                      problem = issue(row),
                      isSelected = selected.includes(key)
                    return (
                      <tr
                        key={key}
                        className={cn(
                          'border-b border-border-faint transition-colors duration-100 last:border-0',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/60',
                        )}
                      >
                        <td className="py-3 pr-0 pl-4 align-middle">
                          <Checkbox
                            className={checkboxCls}
                            aria-label={`Select ${row.name}`}
                            disabled={!data.admin || busy || !row.present || group === 'Linked'}
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              checked === true
                                ? selectRows([row])
                                : setSelected((old) => old.filter((id) => id !== key))
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="font-medium text-foreground">
                            {row.name || 'Unnamed device'}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.serial ? (
                              <span className="font-mono">{row.serial}</span>
                            ) : (
                              'Serial not reported'
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className={row.model ? 'text-foreground' : 'text-subtle'}>
                            {row.model || 'Model not reported'}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.version || 'Version not reported'}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="text-foreground">
                            {row.link && !d.relink
                              ? 'Linked to inventory'
                              : d.mode === 'LINK'
                                ? `Link to ${target?.name ?? 'existing asset'}`
                                : d.mode === 'STACK'
                                  ? 'Link logical stack'
                                  : 'Add new device'}
                          </p>
                          {group !== 'Linked' &&
                            (problem ? (
                              <p
                                className={cn(
                                  'mt-0.5 flex max-w-xs items-start gap-1 text-xs',
                                  warningText,
                                )}
                              >
                                <IconAlertTriangle
                                  size={13}
                                  stroke={1.75}
                                  className="mt-px shrink-0"
                                />
                                {problem}
                              </p>
                            ) : (
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span
                                  aria-hidden
                                  className="size-1.5 rounded-full bg-success-dot"
                                />
                                Ready for batch review
                              </p>
                            ))}
                          {(row.link?.deviceId || row.pending) && (
                            <p className="mt-0.5 flex items-center gap-2 text-xs">
                              {row.link?.deviceId && (
                                <Link
                                  href={`/inventory/devices/${row.link.deviceId}`}
                                  className="text-primary hover:underline"
                                >
                                  View asset
                                </Link>
                              )}
                              {row.pending && (
                                <span className="text-muted-foreground">Pending refresh</span>
                              )}
                            </p>
                          )}
                          {results[key] && (
                            <p role="alert" className="mt-1 max-w-xs text-xs text-destructive">
                              {results[key]}
                            </p>
                          )}
                        </td>
                        {showCreate && (
                          <td className="px-4 py-3 align-middle">
                            {d.mode === 'CREATE' && !row.link ? (
                              <div className="space-y-1.5">
                                <div className="flex gap-1.5">
                                  <Input
                                    aria-label={`Vendor for ${row.name}`}
                                    placeholder="Vendor"
                                    disabled={!data.admin || busy}
                                    value={d.vendor}
                                    onChange={(e) => patch(row, { vendor: e.target.value })}
                                    className={cn(cellInputCls, 'w-28')}
                                  />
                                  <Input
                                    aria-label={`Height for ${row.name}`}
                                    placeholder="U"
                                    disabled={!data.admin || busy}
                                    type="number"
                                    min={1}
                                    max={60}
                                    value={d.height}
                                    onChange={(e) => patch(row, { height: e.target.value })}
                                    className={cn(cellInputCls, 'w-16')}
                                  />
                                  <Input
                                    aria-label={`Asset tag for ${row.name} (optional)`}
                                    placeholder="Asset tag"
                                    disabled={!data.admin || busy}
                                    value={d.assetTag}
                                    onChange={(e) => patch(row, { assetTag: e.target.value })}
                                    className={cn(cellInputCls, 'w-28')}
                                  />
                                </div>
                                {row.model && (
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline disabled:opacity-50"
                                    disabled={!data.admin || busy}
                                    onClick={() =>
                                      selectRows(
                                        rows.filter(
                                          (r) =>
                                            r.model === row.model &&
                                            !r.link &&
                                            r.present &&
                                            !r.conflict &&
                                            !r.reserved &&
                                            draft(r).mode === 'CREATE',
                                        ),
                                      )
                                    }
                                  >
                                    Select all {row.model} on this page
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 align-middle text-xs whitespace-nowrap text-muted-foreground">
                          <time
                            dateTime={row.seenAt}
                            title={fmtDate(row.seenAt)}
                            suppressHydrationWarning
                          >
                            {fmtRelative(row.seenAt)}
                          </time>
                        </td>
                        <td className="px-4 py-3 text-right align-middle">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!data.admin || busy}
                            onClick={() => {
                              setCache((old) => ({ ...old, [key]: row }))
                              setEditor(key)
                            }}
                          >
                            {group === 'Needs attention' ? 'Resolve' : 'Details'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-foreground">No discoveries in {group}</p>
              <p className="mt-1 text-xs text-muted-foreground">Try another group or search.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-subtle">
            <span>
              Page {data.page} of {pages} ({data.total} total)
            </span>
            <div className="flex gap-2">
              {[-1, 1].map((delta) => (
                <Button
                  key={delta}
                  variant="outline"
                  size="sm"
                  disabled={busy || (delta < 0 ? data.page <= 1 : data.page * 25 >= data.total)}
                  onClick={() =>
                    navigate(
                      new URLSearchParams({
                        kind: data.kind,
                        q: data.q,
                        assetq: data.assetq,
                        group,
                        page: String(data.page + delta),
                      }),
                    )
                  }
                >
                  {delta < 0 ? 'Previous' : 'Next'}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {selected.length > 0 && (
          <section
            className="sticky bottom-4 z-20 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm"
            aria-label="Selected devices"
          >
            <p className="text-sm">
              <span className="font-semibold text-foreground">{selected.length} selected</span>
              <span className="text-muted-foreground">
                {' '}
                · {ready.length} ready · {chosen.length - ready.length} need attention
              </span>
            </p>
            {chosenCreate.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-2"
                title="Blank values keep individual entries."
              >
                <span className="text-xs text-muted-foreground">
                  Set for {chosenCreate.length} new{' '}
                  {chosenCreate.length === 1 ? 'device' : 'devices'}
                </span>
                <Input
                  aria-label="Vendor for selected new devices"
                  placeholder="Vendor"
                  className={cn(cellInputCls, 'w-32')}
                  value={sharedVendor}
                  disabled={busy}
                  onChange={(e) => setSharedVendor(e.target.value)}
                />
                <Input
                  aria-label="Height in U for selected new devices"
                  placeholder="Height (U)"
                  className={cn(cellInputCls, 'w-24')}
                  type="number"
                  min={1}
                  max={60}
                  value={sharedHeight}
                  disabled={busy}
                  onChange={(e) => setSharedHeight(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={busy || (!sharedVendor.trim() && !sharedHeight)}
                  onClick={() =>
                    chosenCreate.forEach((row) =>
                      patch(row, {
                        ...(sharedVendor.trim() ? { vendor: sharedVendor.trim() } : {}),
                        ...(sharedHeight ? { height: sharedHeight } : {}),
                      }),
                    )
                  }
                >
                  Apply
                </Button>
              </div>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setSelected([])}>
                Clear selection
              </Button>
              <Button disabled={busy} onClick={() => setReview(true)}>
                Review selection
              </Button>
            </div>
          </section>
        )}
      </main>

      <Sheet
        open={review}
        onOpenChange={(open) => {
          if (!busy) setReview(open)
        }}
      >
        <SheetContent side="right" className={sheetCls}>
          <SheetHeader className="shrink-0 border-b border-border-subtle px-6 py-5">
            <SheetTitle className="font-serif text-base font-semibold text-foreground">
              Review import
            </SheetTitle>
            <SheetDescription className="text-xs text-subtle">
              Link {batch.filter((r) => draft(r).mode !== 'CREATE').length} existing devices or
              stacks · Add {batch.filter((r) => draft(r).mode === 'CREATE').length} devices
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {notice && (
              <p
                role="status"
                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm"
              >
                {notice}
              </p>
            )}
            <p className="max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
              Import accepts the displayed hostname, model, and version. Existing asset tags,
              vendor, height, and placement are preserved. Place new devices in racks afterward.
            </p>
            {chosen.length > ready.length && (
              <p
                className={cn(
                  'flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs',
                  warningText,
                )}
              >
                <IconAlertTriangle size={14} stroke={1.75} className="mt-px shrink-0" />
                {chosen.length - ready.length} unresolved devices will stay selected and will not be
                imported.
              </p>
            )}
            {ready.length > 50 && (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs">
                The first 50 ready devices will be imported. The rest stay selected for the next
                batch.
              </p>
            )}
            <ul className="divide-y divide-border-faint rounded-xl border border-border">
              {chosen.map((row) => {
                const d = draft(row),
                  key = rowKey(row),
                  target = devices.find((v) => v.id === d.targetId),
                  problem = issue(row)
                return (
                  <li key={key} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-foreground">{row.name || d.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.serial || d.serialNumber}
                          </span>
                          <span className="text-[11px] text-subtle">{kindLabel(row.kind)}</span>
                        </p>
                        <p
                          className={cn(
                            'mt-0.5 flex items-start gap-1 text-xs',
                            problem ? warningText : 'text-muted-foreground',
                          )}
                        >
                          {problem && (
                            <IconAlertTriangle size={13} stroke={1.75} className="mt-px shrink-0" />
                          )}
                          {problem ||
                            (d.mode === 'CREATE'
                              ? `Add device · ${d.vendor} · ${d.height}U`
                              : d.mode === 'STACK'
                                ? `Link stack: ${stacks.find((s) => s.id === d.targetId)?.name || d.stackName}`
                                : `Link to ${target?.name}`)}
                        </p>
                        {results[key] && (
                          <p className="mt-0.5 text-xs text-destructive">{results[key]}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setReview(false)
                            setEditor(key)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setSelected((old) => old.filter((id) => id !== key))}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <details className="group/changes mt-1.5">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-subtle transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <IconChevronDown
                          size={12}
                          stroke={1.75}
                          className="-rotate-90 transition-transform group-open/changes:rotate-0"
                        />
                        Technical changes
                      </summary>
                      <div className="mt-1.5 rounded-lg bg-muted px-3 py-1.5">
                        <ChangeTable
                          changes={[
                            ['Hostname', target?.name ?? 'New', row.name || d.name],
                            [
                              'Model',
                              target?.model ?? 'New',
                              row.model || target?.model || d.model,
                            ],
                            [
                              'Version',
                              target?.version || 'Unknown',
                              row.version || target?.version || 'Unknown',
                            ],
                          ]}
                        />
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
          </div>
          <SheetFooter className="shrink-0 gap-3 border-t border-border-subtle bg-muted px-6 py-3.5">
            {legacyPhysical && (
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-foreground">
                <Checkbox
                  className={cn(checkboxCls, 'mt-0.5')}
                  checked={attestation}
                  disabled={busy}
                  onCheckedChange={(checked) => setAttestation(checked === true)}
                />
                I confirm every selected Legacy physical-device record represents one chassis.
                Logical stacks are marked separately.
              </label>
            )}
            <div className="flex items-center justify-end gap-2">
              <FooterCancel onClick={() => setReview(false)} disabled={busy} />
              <FooterSubmit
                onClick={save}
                disabled={busy || !ready.length || (legacyPhysical && !attestation)}
                label={busy ? 'Importing…' : `Import ${Math.min(50, ready.length)} ready devices`}
              />
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null)
        }}
      >
        <SheetContent side="right" className={cn(sheetCls, 'data-[side=right]:sm:max-w-xl')}>
          <SheetHeader className="shrink-0 border-b border-border-subtle px-6 py-5">
            <SheetTitle className="font-serif text-base font-semibold text-foreground">
              {editing ? editing.name || 'Unnamed device' : 'Device details'}
            </SheetTitle>
            <SheetDescription className="text-xs text-subtle">
              Resolve a match, complete missing fields, or configure a logical stack.
            </SheetDescription>
          </SheetHeader>
          {editing &&
            (() => {
              const row = editing,
                key = rowKey(row),
                d = draft(row),
                target = devices.find((device) => device.id === d.targetId),
                problem = issue(row)
              return (
                <>
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border px-4 py-3 text-xs">
                      <div className="col-span-2">
                        <dt className="text-subtle">Source</dt>
                        <dd className="mt-0.5 text-foreground">{row.sourceLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Serial</dt>
                        <dd className="mt-0.5 font-mono text-foreground">
                          {row.serial || 'Not reported'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Model</dt>
                        <dd className="mt-0.5 text-foreground">{row.model || 'Not reported'}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">
                          {d.mode === 'LINK' ? 'Version' : 'Accepted version'}
                        </dt>
                        <dd className="mt-0.5 text-foreground">{row.version || 'Not reported'}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Last received</dt>
                        <dd className="mt-0.5 text-foreground">{fmtDate(row.seenAt)}</dd>
                      </div>
                    </dl>
                    <fieldset disabled={busy} className="space-y-4">
                      <legend className="sr-only">{row.sourceLabel}</legend>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-foreground">Action</span>
                        <select
                          className={selectCls}
                          value={d.mode}
                          onChange={(e) =>
                            patch(row, { mode: e.target.value as Draft['mode'], targetId: '' })
                          }
                        >
                          <option value="CREATE">Add physical device</option>
                          <option value="LINK">Link existing physical asset</option>
                          {row.kind === 'LEGACY' && (
                            <option value="STACK">Link logical stack</option>
                          )}
                        </select>
                      </label>
                      {(row.link ||
                        target?.source ||
                        (d.mode === 'STACK' &&
                          stacks.find((stack) => stack.id === d.targetId)?.source)) && (
                        <label className="flex items-start gap-2.5 text-sm">
                          <Checkbox
                            className={cn(checkboxCls, 'mt-0.5')}
                            checked={d.relink}
                            onCheckedChange={(checked) => patch(row, { relink: checked === true })}
                          />
                          Explicitly replace the existing source association (old assets are
                          retained)
                        </label>
                      )}
                      {d.mode === 'CREATE' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {(
                            [
                              'name',
                              'serialNumber',
                              'model',
                              'vendor',
                              'height',
                              'assetTag',
                            ] as const
                          ).map((field) => {
                            const locked =
                              (field === 'name' && !!row.name) ||
                              (field === 'model' && !!row.model) ||
                              (field === 'serialNumber' && !!serialKey(row.serial))
                            return (
                              <label key={field} className="block space-y-1.5">
                                <span className="text-xs font-medium text-foreground">
                                  {
                                    {
                                      name: 'Hostname',
                                      serialNumber: 'Physical serial',
                                      model: 'Model',
                                      vendor: 'Vendor',
                                      height: 'Height (U)',
                                      assetTag: 'Asset tag (optional)',
                                    }[field]
                                  }
                                  {locked && (
                                    <span className="font-normal text-subtle">
                                      {' '}
                                      · from discovery
                                    </span>
                                  )}
                                </span>
                                <Input
                                  className={cn(
                                    fieldCls,
                                    field === 'serialNumber' && 'font-mono',
                                    locked && 'text-muted-foreground',
                                  )}
                                  value={d[field]}
                                  type={field === 'height' ? 'number' : 'text'}
                                  min={field === 'height' ? 1 : undefined}
                                  readOnly={locked}
                                  onChange={(e) => patch(row, { [field]: e.target.value })}
                                />
                              </label>
                            )
                          })}
                        </div>
                      )}
                      {d.mode === 'LINK' && (
                        <>
                          <label className="block space-y-1.5">
                            <span className="text-xs font-medium text-foreground">
                              Existing physical asset
                            </span>
                            <select
                              className={selectCls}
                              value={d.targetId}
                              onChange={(e) => patch(row, { targetId: e.target.value })}
                            >
                              <option value="">Select an asset</option>
                              {devices.map((device) => (
                                <option key={device.id} value={device.id}>
                                  {device.name} — {device.serialNumber}
                                </option>
                              ))}
                            </select>
                          </label>
                          {target && (
                            <div className="rounded-lg bg-muted px-3 py-2">
                              <ChangeTable
                                changes={[
                                  ['Hostname', target.name, row.name || target.name],
                                  ['Model', target.model, row.model || target.model],
                                  [
                                    'Version',
                                    target.version || 'Unknown',
                                    row.version || target.version || 'Unknown',
                                  ],
                                  ['Serial', target.serialNumber, target.serialNumber],
                                ]}
                              />
                            </div>
                          )}
                        </>
                      )}
                      {d.mode === 'STACK' && (
                        <div className="space-y-4">
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            The Legacy record describes the logical stack. Each physical member
                            keeps its own serial, model, asset tag, and placement.
                          </p>
                          <label className="block space-y-1.5">
                            <span className="text-xs font-medium text-foreground">Stack</span>
                            <select
                              className={selectCls}
                              value={d.targetId}
                              onChange={(e) => patch(row, { targetId: e.target.value })}
                            >
                              <option value="">Create a stack from existing physical assets</option>
                              {stacks.map((stack) => (
                                <option key={stack.id} value={stack.id}>
                                  {stack.name} ({stack.devices.length} members)
                                </option>
                              ))}
                            </select>
                          </label>
                          {!d.targetId && (
                            <>
                              <label className="block space-y-1.5">
                                <span className="text-xs font-medium text-foreground">
                                  Stack name
                                </span>
                                <Input
                                  className={fieldCls}
                                  value={d.stackName}
                                  onChange={(e) => patch(row, { stackName: e.target.value })}
                                />
                              </label>
                              <label className="block space-y-1.5">
                                <span className="text-xs font-medium text-foreground">
                                  Physical members{' '}
                                  <span className="font-normal text-subtle">
                                    · create or CSV-import assets first
                                  </span>
                                </span>
                                <select
                                  multiple
                                  className={cn(SELECT_CLS, 'h-40')}
                                  value={d.memberIds}
                                  onChange={(e) =>
                                    patch(row, {
                                      memberIds: Array.from(
                                        e.target.selectedOptions,
                                        (option) => option.value,
                                      ),
                                    })
                                  }
                                >
                                  {devices
                                    .filter((device) => !device.deviceStackId)
                                    .map((device) => (
                                      <option key={device.id} value={device.id}>
                                        {device.name} — {device.serialNumber}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            </>
                          )}
                        </div>
                      )}
                      {problem && (
                        <p
                          className={cn(
                            'flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs',
                            warningText,
                          )}
                        >
                          <IconAlertTriangle size={14} stroke={1.75} className="mt-px shrink-0" />
                          {problem}
                        </p>
                      )}
                      {results[key] && (
                        <p
                          role="status"
                          className="rounded-lg border border-border bg-muted px-3 py-2 text-xs"
                        >
                          {results[key]}
                        </p>
                      )}
                    </fieldset>
                  </div>
                  <SheetFooter className="shrink-0 flex-row items-center gap-2 border-t border-border-subtle bg-muted px-6 py-3.5">
                    {row.link && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Unlink this source and retain the existing inventory values as manually maintained data?',
                            )
                          )
                            start(async () => {
                              const outcome = await unlinkSource(row.link!.id)
                              setResults((old) => ({
                                ...old,
                                [key]: outcome.success
                                  ? 'Unlinked. Asset retained.'
                                  : outcome.error,
                              }))
                              router.refresh()
                            })
                        }}
                      >
                        Unlink source
                      </Button>
                    )}
                    <div className="ml-auto">
                      <FooterSubmit
                        disabled={busy}
                        onClick={() => {
                          selectRows([row])
                          setEditor(null)
                        }}
                        label={selected.includes(key) ? 'Keep in selection' : 'Add to selection'}
                      />
                    </div>
                  </SheetFooter>
                </>
              )
            })()}
        </SheetContent>
      </Sheet>
    </>
  )
}
