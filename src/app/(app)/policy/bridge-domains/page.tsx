'use client'

import { useMemo, useState, type CSSProperties } from 'react'

type BridgeDomainMode = 'L2 Only' | 'L3'
type BridgeDomainStatus = 'deployed' | 'configured' | 'review'

interface BridgeDomain {
  id: string
  name: string
  tenant: string
  vrf: string
  subnet: string
  mode: BridgeDomainMode
  arpFlood: boolean
  unicastRoute: boolean
  l3out: string
  epgs: number
  status: BridgeDomainStatus
}

const INITIAL_BRIDGE_DOMAINS: BridgeDomain[] = [
  {
    id: '1',
    name: '10.0.129.0x25_BD',
    tenant: 'SERVERFARM',
    vrf: 'SERVERFARM_VRF',
    subnet: '-',
    mode: 'L2 Only',
    arpFlood: true,
    unicastRoute: false,
    l3out: '-',
    epgs: 0,
    status: 'configured',
  },
  {
    id: '2',
    name: '10.0.160.128x25_BD',
    tenant: 'SERVERFARM',
    vrf: 'SERVERFARM_VRF',
    subnet: '-',
    mode: 'L2 Only',
    arpFlood: true,
    unicastRoute: false,
    l3out: '-',
    epgs: 0,
    status: 'configured',
  },
  {
    id: '3',
    name: 'WEB_L3_BD',
    tenant: 'SERVERFARM',
    vrf: 'SERVERFARM_VRF',
    subnet: '10.10.10.1/24',
    mode: 'L3',
    arpFlood: false,
    unicastRoute: true,
    l3out: 'SERVERFARM_L3OUT',
    epgs: 3,
    status: 'deployed',
  },
  {
    id: '4',
    name: 'APP_L3_BD',
    tenant: 'APP',
    vrf: 'APP_VRF',
    subnet: '10.20.20.1/24',
    mode: 'L3',
    arpFlood: false,
    unicastRoute: true,
    l3out: 'APP_L3OUT',
    epgs: 2,
    status: 'review',
  },
]

function StatusBadge({ status }: { status: BridgeDomainStatus }) {
  const style: Record<BridgeDomainStatus, CSSProperties> = {
    deployed: { background: 'var(--success-bg)', color: 'var(--success-text)' },
    configured: { background: 'var(--warning-bg)', color: 'var(--warning-text)' },
    review: { background: 'var(--surface-alt)', color: 'var(--text-subtle)' },
  }

  return (
    <span
      style={style[status]}
      className="text-[10px] font-semibold px-2 py-[3px] rounded-sm uppercase tracking-wide"
    >
      {status}
    </span>
  )
}

function ModeBadge({ mode }: { mode: BridgeDomainMode }) {
  const isL3 = mode === 'L3'

  return (
    <span
      className={[
        'inline-flex items-center rounded-sm px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wide',
        isL3
          ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'bg-[var(--surface-alt)] text-[var(--text-subtle)]',
      ].join(' ')}
    >
      {mode}
    </span>
  )
}

function BooleanValue({ value }: { value: boolean }) {
  return (
    <span
      className={[
        'font-medium',
        value ? 'text-[var(--success-text)]' : 'text-[var(--text-faint)]',
      ].join(' ')}
    >
      {value ? 'true' : 'false'}
    </span>
  )
}

export default function PolicyBridgeDomainsPage() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return INITIAL_BRIDGE_DOMAINS

    return INITIAL_BRIDGE_DOMAINS.filter((bd) =>
      [
        bd.name,
        bd.tenant,
        bd.vrf,
        bd.subnet,
        bd.mode,
        bd.l3out,
        bd.status,
      ].some((value) => value.toLowerCase().includes(q))
    )
  }, [search])

  const l2Count = INITIAL_BRIDGE_DOMAINS.filter((bd) => bd.mode === 'L2 Only').length
  const l3Count = INITIAL_BRIDGE_DOMAINS.filter((bd) => bd.mode === 'L3').length
  const subnetCount = INITIAL_BRIDGE_DOMAINS.filter((bd) => bd.subnet !== '-').length
  const epgCount = INITIAL_BRIDGE_DOMAINS.reduce((sum, bd) => sum + bd.epgs, 0)

  return (
    <div className="min-h-full bg-[var(--bg)]">
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="px-8 py-4">
          <h1 className="font-serif text-[18px] font-semibold text-[var(--text)]">
            Bridge Domains
          </h1>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            Policy inventory placeholder for Bridge Domain data
          </p>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Total BDs', value: INITIAL_BRIDGE_DOMAINS.length, sub: 'policy records' },
            { label: 'L2 Only', value: l2Count, sub: 'routing disabled' },
            { label: 'L3', value: l3Count, sub: 'subnet capable' },
            { label: 'EPG Links', value: epgCount, sub: `${subnetCount} subnets listed` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 animate-fade-up"
            >
              <p className="text-[11px] text-[var(--text-subtle)]">{stat.label}</p>
              <p className="text-[28px] font-semibold text-[var(--text)] leading-none mt-2 font-serif tabular-nums">
                {stat.value}
              </p>
              <p className="text-[11px] text-[var(--text-faint)] mt-1.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          <div className="px-5 py-3.5 border-b border-[var(--border-light)] flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search BD, tenant, VRF, subnet, L3Out..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] text-[var(--text)] placeholder-[var(--text-faint)] transition-colors"
              />
            </div>
            <span className="text-xs text-[var(--text-subtle)] shrink-0 ml-auto">
              {filtered.length} of {INITIAL_BRIDGE_DOMAINS.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--surface-alt)]">
                  {[
                    'BD Name',
                    'Tenant',
                    'VRF',
                    'Mode',
                    'Subnet',
                    'L3Out',
                    'ARP Flood',
                    'Unicast Route',
                    'EPGs',
                    'Status',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wide font-semibold text-[var(--text-subtle)] whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {filtered.map((bd) => (
                  <tr key={bd.id} className="hover:bg-[var(--surface-alt)]/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-[var(--text)] whitespace-nowrap">
                      {bd.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-subtle)] whitespace-nowrap">
                      {bd.tenant}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-subtle)] whitespace-nowrap">
                      {bd.vrf}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ModeBadge mode={bd.mode} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-subtle)] whitespace-nowrap">
                      {bd.subnet}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-subtle)] whitespace-nowrap">
                      {bd.l3out}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <BooleanValue value={bd.arpFlood} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <BooleanValue value={bd.unicastRoute} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-subtle)] tabular-nums whitespace-nowrap">
                      {bd.epgs}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={bd.status} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-sm text-[var(--text-subtle)]"
                    >
                      No Bridge Domain data matches the current search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
