'use client'
import { useState, useTransition } from 'react'
import { serialKey } from '@/lib/inventory/sources/identity'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { linkSources, unlinkSource } from '@/lib/inventory/sources/actions'
import type { LinkInput } from '@/lib/inventory/sources/mutation'
import type { DiscoveryData } from '@/lib/inventory/sources/query'

type Draft = {
  mode: 'CREATE' | 'LINK' | 'STACK'
  targetId: string
  name: string
  serialNumber: string
  model: string
  vendor: string
  height: string
  assetTag: string
  stackName: string
  memberIds: string[]
  relink: boolean
}
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'
export function DiscoveryClient({ data }: { data: DiscoveryData }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [attestation, setAttestation] = useState(false)
  const [sharedVendor, setSharedVendor] = useState('')
  const [sharedHeight, setSharedHeight] = useState('')
  const [results, setResults] = useState<Record<string, string>>({})
  const [busy, start] = useTransition()
  function draft(row: DiscoveryData['rows'][number]): Draft {
    return (
      drafts[row.id] ?? {
        mode: row.matchCount === 1 ? 'LINK' : 'CREATE',
        targetId: row.matchCount === 1 ? row.matchId! : '',
        name: row.name,
        serialNumber: serialKey(row.serial) ? row.serial! : '',
        model: row.model ?? '',
        vendor: row.vendor,
        height: '',
        assetTag: '',
        stackName: row.name,
        memberIds: [],
        relink: false,
      }
    )
  }
  function patch(row: DiscoveryData['rows'][number], value: Partial<Draft>) {
    setDrafts((old) => ({ ...old, [row.id]: { ...draft(row), ...value } }))
  }
  function save() {
    start(async () => {
      const inputs: LinkInput[] = selected.map((id) => {
        const row = data.rows.find((r) => r.id === id)!
        const d = draft(row)
        return {
          kind: data.kind,
          sourceId: id,
          reviewToken: row.reviewToken,
          target: d.mode === 'STACK' ? 'STACK' : 'DEVICE',
          targetId: d.mode === 'CREATE' ? undefined : d.targetId || undefined,
          singleChassis: attestation,
          replaceSourceId: d.relink
            ? (row.link?.id ??
              (d.mode === 'STACK'
                ? data.stacks.find((stack) => stack.id === d.targetId)?.source?.id
                : data.devices.find((device) => device.id === d.targetId)?.source?.id))
            : undefined,
          stackName: d.stackName,
          memberIds: d.memberIds,
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
        setResults(
          Object.fromEntries(
            outcomes.map((o) => [
              o.sourceId,
              o.success ? 'Saved — source linked to inventory.' : o.error,
            ]),
          ),
        )
        router.refresh()
      } catch {
        setResults(
          Object.fromEntries(
            selected.map((id) => [
              id,
              'Unable to save. Refresh to check which links completed before retrying.',
            ]),
          ),
        )
      }
    })
  }
  return (
    <div className="space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review collected device information, then add an asset or link an existing one. Asset
          tags, vendor, height, placement, and membership stay under your control.
        </p>
        <Link className="text-sm text-primary underline" href="/inventory/devices">
          Manual inventory
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm" role="status">
        <strong>{data.health.state}</strong>
        <span className="ml-3 text-muted-foreground">
          {data.health.pending} pending · {data.health.failed} retrying
        </span>
        {data.health.lastCompletedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Last worker completion: {data.health.lastCompletedAt}
          </p>
        )}
        {data.health.oldest && (
          <p className="text-xs text-muted-foreground">
            Oldest pending observation: {data.health.oldest}
          </p>
        )}
        {data.health.error && <p>{data.health.error}</p>}
        {!data.health.state.startsWith('Worker healthy') &&
          !data.health.state.startsWith('Worker running') && (
            <p className="mt-2">
              Automatic refresh is unavailable or unverified.{' '}
              {data.admin
                ? 'Configure SCHEDULER_TOKEN and start the scheduler service; check its logs and heartbeat.'
                : 'Contact an administrator to check the inventory worker.'}
            </p>
          )}
      </div>
      <form className="flex flex-wrap gap-2" action="/inventory/discovered">
        <select
          name="kind"
          aria-label="Discovery source"
          defaultValue={data.kind}
          className={selectClass + ' max-w-36'}
        >
          <option>ACI</option>
          <option>LEGACY</option>
        </select>
        <Input
          name="q"
          aria-label="Search discoveries"
          defaultValue={data.q}
          placeholder="Hostname or serial"
          className="max-w-xs"
        />
        <select
          name="linked"
          aria-label="Link status"
          defaultValue={data.linked}
          className={selectClass + ' max-w-40'}
        >
          <option value="">All discoveries</option>
          <option value="no">Unlinked</option>
          <option value="yes">Linked</option>
        </select>
        <Input
          name="assetq"
          aria-label="Find inventory targets"
          defaultValue={data.assetq}
          placeholder="Find asset or stack targets"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Review</th>
              <th>Hostname / serial</th>
              <th>Model / version</th>
              <th>Inventory</th>
              <th className="p-3">Last received</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Review ${row.name}`}
                    disabled={!data.admin || busy || !row.present}
                    checked={selected.includes(row.id)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked ? [...old, row.id] : old.filter((id) => id !== row.id),
                      )
                    }
                  />
                </td>
                <td className="py-3">
                  <div className="font-medium">{row.name || 'Unnamed device'}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.serial || 'Serial not reported'}
                  </div>
                </td>
                <td>
                  <div>{row.model || 'Model not reported'}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.version || 'Version not reported'}
                  </div>
                </td>
                <td>
                  {row.link ? (
                    <>
                      <span>
                        {row.reserved ? 'Disconnected source reservation' : 'Linked'}
                        {row.link.stackId ? ' to stack' : ''}
                      </span>
                      {row.link.deviceId && (
                        <Link
                          className="ml-2 text-primary underline"
                          href={`/inventory/devices/${row.link.deviceId}`}
                        >
                          View asset
                        </Link>
                      )}
                    </>
                  ) : row.matchCount === 1 ? (
                    'Existing asset match'
                  ) : row.matchCount > 1 ? (
                    'Ambiguous serial'
                  ) : (
                    'Unlinked'
                  )}
                  {row.pending && <p className="text-xs">Pending refresh</p>}
                  {row.link?.conflict && (
                    <p className="max-w-xs text-xs text-destructive">{row.link.conflict}</p>
                  )}
                  {!row.present && <p className="text-xs">Missing from latest scan</p>}
                </td>
                <td className="p-3 text-xs text-muted-foreground">{row.seenAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && (
          <p className="p-8 text-sm text-muted-foreground">
            No discoveries match these filters. Collect ACI or Legacy data, or add an untracked
            device manually.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>
          {data.total} discoveries · Page {data.page}
        </span>
        <div className="flex gap-4">
          {data.page > 1 && (
            <Link
              href={`?${new URLSearchParams({
                kind: data.kind,
                q: data.q,
                linked: data.linked,
                assetq: data.assetq,
                page: String(data.page - 1),
              })}`}
            >
              Previous
            </Link>
          )}
          {data.page * 25 < data.total && (
            <Link
              href={`?${new URLSearchParams({
                kind: data.kind,
                q: data.q,
                linked: data.linked,
                assetq: data.assetq,
                page: String(data.page + 1),
              })}`}
            >
              Next
            </Link>
          )}
        </div>
      </div>
      {selected.length > 0 && (
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="font-serif text-lg font-semibold">
            Review {selected.length} selected {selected.length === 1 ? 'discovery' : 'discoveries'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Saving accepts the displayed hostname, model, and version. Physical serials must agree.
            Target selectors show up to 200 search results plus exact serial matches; use Find asset
            or stack targets to narrow them. Existing asset details are preserved. Set rack
            placement from Inventory after adoption.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Shared vendor
              <Input value={sharedVendor} onChange={(e) => setSharedVendor(e.target.value)} />
            </label>
            <label className="text-sm">
              Shared height (U)
              <Input
                type="number"
                min="1"
                max="60"
                value={sharedHeight}
                onChange={(e) => setSharedHeight(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              onClick={() =>
                setDrafts((old) => ({
                  ...old,
                  ...Object.fromEntries(
                    data.rows
                      .filter((row) => selected.includes(row.id))
                      .map((row) => [
                        row.id,
                        {
                          ...draft(row),
                          ...(sharedVendor ? { vendor: sharedVendor } : {}),
                          ...(sharedHeight ? { height: sharedHeight } : {}),
                        },
                      ]),
                  ),
                }))
              }
            >
              Apply to selected new assets
            </Button>
          </div>
          {data.rows
            .filter((row) => selected.includes(row.id))
            .map((row) => {
              const d = draft(row)
              const target = data.devices.find((device) => device.id === d.targetId)
              return (
                <div key={row.id} className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="font-medium">{row.sourceLabel}</h3>
                  <label className="block text-sm">
                    Action
                    <select
                      className={selectClass}
                      value={d.mode}
                      onChange={(e) =>
                        patch(row, { mode: e.target.value as Draft['mode'], targetId: '' })
                      }
                    >
                      <option value="CREATE">Add physical device</option>
                      <option value="LINK">Link existing physical asset</option>
                      {data.kind === 'LEGACY' && <option value="STACK">Link logical stack</option>}
                    </select>
                  </label>
                  {(row.link ||
                    target?.source ||
                    (d.mode === 'STACK' &&
                      data.stacks.find((stack) => stack.id === d.targetId)?.source)) && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={d.relink}
                        onChange={(e) => patch(row, { relink: e.target.checked })}
                      />
                      Explicitly replace the existing source association (old assets are retained)
                    </label>
                  )}
                  {d.mode === 'CREATE' && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {(
                        ['name', 'serialNumber', 'model', 'vendor', 'height', 'assetTag'] as const
                      ).map((field) => (
                        <label key={field} className="text-sm">
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
                          <Input
                            value={d[field]}
                            type={field === 'height' ? 'number' : 'text'}
                            min={field === 'height' ? 1 : undefined}
                            readOnly={
                              (field === 'name' && !!row.name) ||
                              (field === 'model' && !!row.model) ||
                              (field === 'serialNumber' && !!serialKey(row.serial))
                            }
                            onChange={(e) => patch(row, { [field]: e.target.value })}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {d.mode === 'LINK' && (
                    <>
                      <label className="block text-sm">
                        Existing physical asset
                        <select
                          className={selectClass}
                          value={d.targetId}
                          onChange={(e) => patch(row, { targetId: e.target.value })}
                        >
                          <option value="">Select an asset</option>
                          {data.devices.map((device) => (
                            <option key={device.id} value={device.id}>
                              {device.name} — {device.serialNumber}
                            </option>
                          ))}
                        </select>
                      </label>
                      {target && (
                        <p className="text-sm">
                          Hostname: {target.name} → {row.name || target.name}; model: {target.model}{' '}
                          → {row.model || target.model}; version: {target.version || 'Unknown'} →{' '}
                          {row.version || target.version || 'Unknown'}. Serial:{' '}
                          {target.serialNumber}.
                        </p>
                      )}
                    </>
                  )}
                  {d.mode === 'STACK' && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        The Legacy record describes the logical stack. Each physical member keeps
                        its own serial, model, asset tag, and placement.
                      </p>
                      <label className="block text-sm">
                        Stack
                        <select
                          className={selectClass}
                          value={d.targetId}
                          onChange={(e) => patch(row, { targetId: e.target.value })}
                        >
                          <option value="">Create a stack from existing physical assets</option>
                          {data.stacks.map((stack) => (
                            <option key={stack.id} value={stack.id}>
                              {stack.name} ({stack.devices.length} members)
                            </option>
                          ))}
                        </select>
                      </label>
                      {!d.targetId && (
                        <>
                          <label className="block text-sm">
                            Stack name
                            <Input
                              value={d.stackName}
                              onChange={(e) => patch(row, { stackName: e.target.value })}
                            />
                          </label>
                          <label className="block text-sm">
                            Physical members (create or CSV-import assets first)
                            <select
                              multiple
                              className={selectClass + ' h-32'}
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
                              {data.devices
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
                  {d.mode !== 'LINK' && (
                    <p className="text-xs text-muted-foreground">
                      Accepted version: {row.version || 'Not reported'}
                    </p>
                  )}
                  {results[row.id] && (
                    <p role="status" className="text-sm">
                      {results[row.id]}
                    </p>
                  )}
                  {row.link && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
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
                              [row.id]: outcome.success
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
                </div>
              )
            })}
          {data.kind === 'LEGACY' &&
            selected.some((id) => draft(data.rows.find((r) => r.id === id)!).mode !== 'STACK') && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attestation}
                  onChange={(e) => setAttestation(e.target.checked)}
                />
                I confirm each selected physical-device source represents one chassis, not a logical
                stack.
              </label>
            )}
          <Button disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Confirm and save selected'}
          </Button>
        </section>
      )}
    </div>
  )
}
