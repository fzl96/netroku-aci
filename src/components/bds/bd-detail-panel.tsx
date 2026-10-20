'use client'

import Link from 'next/link'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { BdRow } from '@/lib/bds/types'
import { buildEpgPageUrl, parseEpgPageParams } from '@/lib/epgs/params'
import { MUTED_TABLE_HEAD_CLS } from '@/lib/ui-classes'

export function BdFlag({ value }: { value: boolean | null }) {
  return (
    <span className={value ? 'font-medium text-success' : 'text-subtle'}>
      {value === null ? '—' : value ? 'Yes' : 'No'}
    </span>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wider text-subtle uppercase">{label}</p>
      <div className="mt-1 text-xs text-foreground">{children}</div>
    </div>
  )
}
export function BdDetailPanel({ bd, onClose }: { bd: BdRow | null; onClose: () => void }) {
  return (
    <Sheet
      open={bd !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl data-[side=right]:sm:max-w-[640px]"
      >
        {bd && (
          <>
            <SheetHeader className="shrink-0 border-b border-subtle px-6 py-5">
              <SheetTitle className="truncate pr-6 font-serif text-base font-semibold">
                {bd.name}
              </SheetTitle>
              <SheetDescription className="text-xs text-subtle">{bd.tenant}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <Field label="Distinguished Name">
                <span className="font-mono break-all">{bd.dn}</span>
              </Field>
              <Field label="Description">{bd.description || '—'}</Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="VRF">
                  <span title={bd.vrfDn} className="font-mono break-all">
                    {bd.vrf || '—'}
                  </span>
                </Field>
                <Field label="Routing Enabled">
                  <BdFlag value={bd.unicastRoute} />
                </Field>
                <Field label="ARP Flooding">
                  <BdFlag value={bd.arpFlood} />
                </Field>
                <Field label="IP Learning">
                  <BdFlag value={bd.ipLearning} />
                </Field>
                <Field label="Limit IP Learning to Subnets">
                  <BdFlag value={bd.limitIpLearnToSubnets} />
                </Field>
                <Field label="L2 Unknown Unicast">{bd.unkMacUcastAct || '—'}</Field>
                <Field label="L3 Unknown Multicast">{bd.unkMcastAct || '—'}</Field>
                <Field label="Multi Destination Flooding">{bd.multiDstPktAct || '—'}</Field>
              </div>
              {bd.vrfDn && (
                <Field label="VRF DN">
                  <span className="font-mono break-all">{bd.vrfDn}</span>
                </Field>
              )}
              <Field label="L3Out Associations">
                {bd.l3Outs.length
                  ? bd.l3Outs.map((out) => (
                      <span
                        key={out}
                        className="mr-1 mb-1 inline-block rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                      >
                        {out}
                      </span>
                    ))
                  : 'None'}
              </Field>
              <Field label={`Subnets (${bd.subnets.length})`}>
                {!bd.subnets.length ? (
                  <p className="text-subtle">No subnets configured.</p>
                ) : (
                  <div className="space-y-2">
                    {bd.subnets.map((subnet) => (
                      <div
                        key={subnet.ip}
                        className="space-y-1 rounded-lg border border-border p-3"
                      >
                        <p className="font-mono font-medium">{subnet.ip}</p>
                        {subnet.description && <p>{subnet.description}</p>}
                        <p className="text-subtle">
                          Scope: {subnet.scope || '—'} · Preferred:{' '}
                          <BdFlag value={subnet.preferred} />
                        </p>
                        <p className="text-subtle">
                          Control: {subnet.ctrl || '—'} · IP data plane learning:{' '}
                          {subnet.ipDPLearning || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
              <Field label={`Connected EPGs (${bd.epgs.length})`}>
                {!bd.epgs.length ? (
                  <p className="text-subtle">No connected EPGs.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['EPG', 'Tenant', 'Application Profile'].map((label) => (
                            <th key={label} className={MUTED_TABLE_HEAD_CLS}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bd.epgs.map((epg) => (
                          <tr key={epg.dn} className="border-b border-border-faint last:border-0">
                            <td className="px-4 py-2 font-mono">
                              <Link
                                href={buildEpgPageUrl(
                                  parseEpgPageParams({ apic: bd.apicHostId, selected: epg.dn }),
                                )}
                                className="text-primary underline-offset-4 hover:underline"
                                title={epg.dn}
                              >
                                {epg.name}
                              </Link>
                            </td>
                            <td className="px-4 py-2">{epg.tenant}</td>
                            <td className="px-4 py-2 font-mono">{epg.appProfile}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Field>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
