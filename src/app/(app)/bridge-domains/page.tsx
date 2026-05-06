// src/app/bridge-domains/page.tsx
'use client'

import { useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type BDStatus = 'deployed' | 'configured' | 'error'

interface BD {
  id: string
  name: string
  tenant: string
  vrf: string
  subnet: string
  l3: boolean
  arpFlooding: boolean
  limitIpLearning: boolean
  epgCount: number
  status: BDStatus
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const INITIAL_BDS: BD[] = [
  { id: '1', name: 'VLAN1411-BD', tenant: 'serverfarm', vrf: 'serverfarm-VRF', subnet: '10.14.11.1/24', l3: true,  arpFlooding: false, limitIpLearning: true,  epgCount: 1, status: 'deployed'   },
  { id: '2', name: 'VLAN1412-BD', tenant: 'serverfarm', vrf: 'serverfarm-VRF', subnet: '10.14.12.1/24', l3: true,  arpFlooding: false, limitIpLearning: true,  epgCount: 1, status: 'deployed'   },
  { id: '3', name: 'MGMT-BD',     tenant: 'TenantA',    vrf: 'TenantA-VRF',    subnet: '192.168.1.1/24', l3: true,  arpFlooding: false, limitIpLearning: false, epgCount: 2, status: 'deployed'   },
  { id: '4', name: 'Web-BD',      tenant: 'TenantB',    vrf: 'TenantB-VRF',    subnet: '172.16.10.1/24', l3: true,  arpFlooding: false, limitIpLearning: false, epgCount: 1, status: 'deployed'   },
  { id: '5', name: 'Storage-BD',  tenant: 'TenantA',    vrf: 'TenantA-VRF',    subnet: '',               l3: false, arpFlooding: true,  limitIpLearning: false, epgCount: 0, status: 'configured' },
]

const TENANTS = ['serverfarm', 'TenantA', 'TenantB']
const VRFS: Record<string, string[]> = {
  serverfarm: ['serverfarm-VRF'],
  TenantA:    ['TenantA-VRF', 'TenantA-Mgmt-VRF'],
  TenantB:    ['TenantB-VRF'],
}

// ─── Shared input styles ─────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full text-sm px-3 py-2 bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] ' +
  'text-[var(--text)] placeholder-[var(--text-faint)] transition-colors'

const SELECT_CLS = `${INPUT_CLS} cursor-pointer`

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BDStatus }) {
  const style: Record<BDStatus, React.CSSProperties> = {
    deployed:   { background: 'var(--success-bg)', color: 'var(--success-text)' },
    configured: { background: 'var(--warning-bg)', color: 'var(--warning-text)' },
    error:      { background: 'var(--error-bg)',   color: 'var(--error-text)'   },
  }
  return (
    <span style={style[status]}
      className="text-[10px] font-semibold px-2 py-[3px] rounded-sm uppercase tracking-wide">
      {status}
    </span>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer"
    >
      <span className={[
        'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
      ].join(' ')} />
    </button>
  )
}

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--text)]">
        {label}
        {required && <span className="text-[var(--accent)] ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[var(--text-subtle)]">{hint}</p>}
    </div>
  )
}

// ─── Default form state ───────────────────────────────────────────────────────

const DEFAULT_FORM = {
  name:            '',
  tenant:          'serverfarm',
  vrf:             'serverfarm-VRF',
  subnet:          '',
  l3:              true,
  arpFlooding:     false,
  limitIpLearning: true,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BridgeDomainsPage() {
  const [bds, setBDs]         = useState<BD[]>(INITIAL_BDS)
  const [search, setSearch]   = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm]       = useState(DEFAULT_FORM)

  const filtered = bds.filter(bd =>
    bd.name.toLowerCase().includes(search.toLowerCase()) ||
    bd.tenant.toLowerCase().includes(search.toLowerCase()) ||
    bd.vrf.toLowerCase().includes(search.toLowerCase())
  )

  const deployedCount = bds.filter(b => b.status === 'deployed').length
  const l3Count       = bds.filter(b => b.l3).length
  const subnetCount   = bds.filter(b => b.subnet).length

  function updateForm<K extends keyof typeof DEFAULT_FORM>(key: K, val: (typeof DEFAULT_FORM)[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: val }
      if (key === 'tenant') {
        next.vrf = VRFS[val as string]?.[0] ?? ''
      }
      return next
    })
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBDs(prev => [{
      id: Date.now().toString(), ...form, epgCount: 0, status: 'configured' as BDStatus,
    }, ...prev])
    setPanelOpen(false)
    setForm(DEFAULT_FORM)
  }

  function handleDelete(id: string) {
    setBDs(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="min-h-full bg-[var(--bg)]">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-[var(--text)]">Bridge Domains</h1>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">Manage L2/L3 forwarding domains across tenants</p>
          </div>
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 bg-[var(--accent)] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            Create BD
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total BDs',  value: bds.length,    sub: 'across all tenants'              },
            { label: 'Deployed',   value: deployedCount, sub: `${bds.length - deployedCount} configured` },
            { label: 'L3 Routing', value: l3Count,       sub: `${bds.length - l3Count} L2-only` },
            { label: 'Subnets',    value: subnetCount,   sub: 'configured gateways'             },
          ].map(s => (
            <div key={s.label}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 animate-fade-up">
              <p className="text-[11px] text-[var(--text-subtle)]">{s.label}</p>
              <p className="text-[28px] font-semibold text-[var(--text)] leading-none mt-2 font-serif tabular-nums">
                {s.value}
              </p>
              <p className="text-[11px] text-[var(--text-faint)] mt-1.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          {/* Toolbar */}
          <div className="px-5 py-3.5 border-b border-[var(--border-light)] flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search name, tenant, VRF…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] text-[var(--text)] placeholder-[var(--text-faint)] transition-colors"
              />
            </div>
            <span className="text-xs text-[var(--text-subtle)] shrink-0 ml-auto">
              {filtered.length} of {bds.length}
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--surface-alt)]">
                  {['Name', 'Tenant', 'VRF', 'Subnet', 'L3', 'ARP', 'EPGs', 'Status', ''].map(h => (
                    <th key={h}
                      className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wide font-semibold text-[var(--text-subtle)] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center">
                      <p className="text-sm text-[var(--text-subtle)]">No bridge domains found</p>
                      <p className="text-xs text-[var(--text-faint)] mt-1">Try a different search term</p>
                    </td>
                  </tr>
                ) : filtered.map(bd => (
                  <tr key={bd.id}
                    className="border-b border-[var(--border-lighter)] last:border-0 hover:bg-[var(--surface-alt)] transition-colors group">
                    <td className="px-4 py-3 font-mono font-medium text-[var(--text)]">{bd.name}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{bd.tenant}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-subtle)] text-[11px]">{bd.vrf}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-muted)]">
                      {bd.subnet || <span className="text-[var(--text-faint)]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        style={{ background: bd.l3 ? 'var(--success-dot)' : 'var(--border)' }}
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        title={bd.l3 ? 'L3 enabled' : 'L2 only'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        style={{ background: bd.arpFlooding ? '#f59e0b' : 'var(--border)' }}
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        title={bd.arpFlooding ? 'ARP flooding on' : 'ARP flooding off'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {bd.epgCount > 0
                        ? <span className="font-medium text-[var(--text)]">{bd.epgCount}</span>
                        : <span className="text-[var(--text-faint)]">0</span>
                      }
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={bd.status} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(bd.id)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-faint)] hover:text-[var(--error-text)] transition-all"
                        title="Delete"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6l-1 14H6L5 6M9 6V4h6v2M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create panel */}
      {panelOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-20"
            onClick={() => setPanelOpen(false)} />
          <aside
            style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
            className="fixed right-0 top-0 h-full w-[420px] z-30 flex flex-col shadow-2xl animate-panel-in"
          >
            <div className="px-6 py-5 border-b border-[var(--border-light)] flex items-start justify-between shrink-0">
              <div>
                <h2 className="font-serif text-base font-semibold text-[var(--text)]">Create Bridge Domain</h2>
                <p className="text-xs text-[var(--text-subtle)] mt-0.5">Configure a new forwarding domain</p>
              </div>
              <button onClick={() => setPanelOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form id="create-bd-form" onSubmit={handleCreate}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <FormField label="Bridge Domain Name" required>
                <input type="text" className={INPUT_CLS} placeholder="e.g. VLAN1413-BD"
                  value={form.name} onChange={e => updateForm('name', e.target.value)} required autoFocus />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tenant" required>
                  <select className={SELECT_CLS} value={form.tenant} onChange={e => updateForm('tenant', e.target.value)}>
                    {TENANTS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </FormField>
                <FormField label="VRF" required>
                  <select className={SELECT_CLS} value={form.vrf} onChange={e => updateForm('vrf', e.target.value)}>
                    {(VRFS[form.tenant] ?? []).map(v => <option key={v}>{v}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Subnet / Gateway IP" hint="Format: 10.0.0.1/24 — leave empty for L2-only BD">
                <input type="text" className={`${INPUT_CLS} font-mono`} placeholder="10.0.0.1/24"
                  value={form.subnet} onChange={e => updateForm('subnet', e.target.value)} />
              </FormField>

              <div className="border-t border-[var(--border-light)] pt-4 space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Forwarding Settings
                </p>
                {[
                  { key: 'l3' as const,             label: 'Layer 3 / Unicast Routing', hint: 'Enable IP routing for this BD' },
                  { key: 'arpFlooding' as const,    label: 'ARP Flooding',               hint: 'Flood ARP across fabric (L2 scenarios)' },
                  { key: 'limitIpLearning' as const, label: 'Limit IP Learning',         hint: 'Restrict endpoint IP learning' },
                ].map(({ key, label, hint }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-[var(--text)]">{label}</p>
                      <p className="text-[11px] text-[var(--text-subtle)] mt-0.5">{hint}</p>
                    </div>
                    <Toggle checked={form[key]} onChange={v => updateForm(key, v)} />
                  </div>
                ))}
              </div>
            </form>

            <div
              style={{ background: 'var(--surface-alt)', borderTop: '1px solid var(--border-light)' }}
              className="px-6 py-4 flex items-center justify-end gap-3 shrink-0"
            >
              <button type="button" onClick={() => setPanelOpen(false)}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-4 py-2">
                Cancel
              </button>
              <button type="submit" form="create-bd-form"
                className="bg-[var(--accent)] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors">
                Create BD
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
