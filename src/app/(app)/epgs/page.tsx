'use client'

import { useState } from 'react'
import {
  INPUT_CLS,
  MUTED_TABLE_HEAD_CLS,
  SELECT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type EPGStatus = 'deployed' | 'configured' | 'error'

interface EPG {
  id: string
  name: string
  tenant: string
  ap: string
  bd: string
  staticPorts: number
  contracts: number
  preferredGroup: boolean
  isolation: boolean
  status: EPGStatus
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const INITIAL_EPGS: EPG[] = [
  { id: '1', name: 'VLAN1411_EPG', tenant: 'serverfarm', ap: 'DC2-SERVERFARM-AP', bd: 'VLAN1411-BD', staticPorts: 4, contracts: 2, preferredGroup: false, isolation: false, status: 'deployed'   },
  { id: '2', name: 'VLAN1412_EPG', tenant: 'serverfarm', ap: 'DC2-SERVERFARM-AP', bd: 'VLAN1412-BD', staticPorts: 2, contracts: 2, preferredGroup: false, isolation: false, status: 'deployed'   },
  { id: '3', name: 'Web-EPG',      tenant: 'TenantB',    ap: 'App2-AP',           bd: 'Web-BD',      staticPorts: 3, contracts: 1, preferredGroup: true,  isolation: false, status: 'deployed'   },
  { id: '4', name: 'Mgmt-EPG',     tenant: 'TenantA',    ap: 'App1-AP',           bd: 'MGMT-BD',     staticPorts: 1, contracts: 0, preferredGroup: false, isolation: false, status: 'deployed'   },
  { id: '5', name: 'DB-EPG',       tenant: 'TenantA',    ap: 'App1-AP',           bd: 'MGMT-BD',     staticPorts: 0, contracts: 1, preferredGroup: false, isolation: true,  status: 'configured' },
]

const TENANTS = ['serverfarm', 'TenantA', 'TenantB']
const APS: Record<string, string[]> = {
  serverfarm: ['DC2-SERVERFARM-AP'],
  TenantA:    ['App1-AP', 'Mgmt-AP'],
  TenantB:    ['App2-AP'],
}
const BDS: Record<string, string[]> = {
  serverfarm: ['VLAN1411-BD', 'VLAN1412-BD'],
  TenantA:    ['MGMT-BD', 'Storage-BD'],
  TenantB:    ['Web-BD'],
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EPGStatus }) {
  const cls: Record<EPGStatus, string> = {
    deployed: 'bg-success-bg text-success',
    configured: 'bg-warning-bg text-warning',
    error: 'bg-error-bg text-error',
  }
  return (
    <span
      className={cn(
        'rounded-sm px-2 py-[3px] text-[10px] font-semibold tracking-wide uppercase',
        cls[status],
      )}
    >
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
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none',
        checked ? 'bg-primary' : 'bg-border',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-primary-foreground shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-primary ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-subtle">{hint}</p>}
    </div>
  )
}

// ─── Default form ─────────────────────────────────────────────────────────────

const DEFAULT_FORM = {
  name: '', tenant: 'serverfarm', ap: 'DC2-SERVERFARM-AP', bd: 'VLAN1411-BD',
  preferredGroup: false, isolation: false,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EPGsPage() {
  const [epgs, setEPGs]       = useState<EPG[]>(INITIAL_EPGS)
  const [search, setSearch]   = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm]       = useState(DEFAULT_FORM)

  const filtered = epgs.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.tenant.toLowerCase().includes(search.toLowerCase()) ||
    e.ap.toLowerCase().includes(search.toLowerCase()) ||
    e.bd.toLowerCase().includes(search.toLowerCase())
  )

  const deployedCount  = epgs.filter(e => e.status === 'deployed').length
  const totalPorts     = epgs.reduce((s, e) => s + e.staticPorts, 0)
  const totalContracts = epgs.reduce((s, e) => s + e.contracts, 0)

  function updateForm<K extends keyof typeof DEFAULT_FORM>(key: K, val: (typeof DEFAULT_FORM)[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: val }
      if (key === 'tenant') {
        const t = val as string
        next.ap = APS[t]?.[0] ?? ''
        next.bd = BDS[t]?.[0] ?? ''
      }
      return next
    })
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setEPGs(prev => [{
      id: Date.now().toString(), ...form, staticPorts: 0, contracts: 0, status: 'configured' as EPGStatus,
    }, ...prev])
    setPanelOpen(false)
    setForm(DEFAULT_FORM)
  }

  function handleDelete(id: string) {
    setEPGs(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="min-h-full bg-background">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Endpoint Groups</h1>
            <p className="text-xs text-subtle mt-0.5">Define policy groups and their network associations</p>
          </div>
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            Create EPG
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total EPGs',   value: epgs.length,    sub: 'across all tenants'                  },
            { label: 'Deployed',     value: deployedCount,  sub: `${epgs.length - deployedCount} in progress` },
            { label: 'Static Ports', value: totalPorts,     sub: 'port bindings total'                 },
            { label: 'Contracts',    value: totalContracts, sub: 'policy associations'                 },
          ].map(s => (
            <div key={s.label}
              className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
              <p className="text-[11px] text-subtle">{s.label}</p>
              <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
                {s.value}
              </p>
              <p className="text-[11px] text-faint mt-1.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          {/* Toolbar */}
          <div className="px-5 py-3.5 border-b border-subtle flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input type="text" placeholder="Search name, tenant, AP, BD…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted border border-border rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-foreground placeholder:text-faint transition-colors"
              />
            </div>
            <span className="text-xs text-subtle shrink-0 ml-auto">
              {filtered.length} of {epgs.length}
            </span>
          </div>

          {/* Table */}
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-subtle bg-muted">
                  {['EPG Name', 'Tenant', 'App Profile', 'Bridge Domain', 'Ports', 'Contracts', 'Status', ''].map(h => (
                    <th key={h}
                      className={MUTED_TABLE_HEAD_CLS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center">
                      <p className="text-sm text-subtle">No EPGs found</p>
                      <p className="text-xs text-faint mt-1">Try a different search term</p>
                    </td>
                  </tr>
                ) : filtered.map(epg => (
                  <tr key={epg.id}
                    className="border-b border-border-faint last:border-0 hover:bg-muted transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-foreground">{epg.name}</span>
                        {epg.isolation && (
                          <span title="Intra-EPG isolation" className="text-warning">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{epg.tenant}</td>
                    <td className="px-4 py-3 font-mono text-subtle text-[11px]">{epg.ap}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{epg.bd}</td>
                    <td className="px-4 py-3">
                      {epg.staticPorts > 0
                        ? <span className="font-medium text-foreground">{epg.staticPorts}</span>
                        : <span className="text-faint">0</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {epg.contracts > 0
                        ? <span className="font-medium text-foreground">{epg.contracts}</span>
                        : <span className="text-faint">0</span>
                      }
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={epg.status} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(epg.id)}
                        className="opacity-0 group-hover:opacity-100 text-faint hover:text-error transition-all"
                        title="Delete">
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
          <aside className="animate-panel-in fixed top-0 right-0 z-30 flex h-full w-[420px] flex-col border-l border-border bg-card shadow-2xl">
            <div className="px-6 py-5 border-b border-subtle flex items-start justify-between shrink-0">
              <div>
                <h2 className="font-serif text-base font-semibold text-foreground">Create Endpoint Group</h2>
                <p className="text-xs text-subtle mt-0.5">Add a new EPG to an application profile</p>
              </div>
              <button onClick={() => setPanelOpen(false)}
                className="text-faint hover:text-muted-foreground transition-colors mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form id="create-epg-form" onSubmit={handleCreate}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <FormField label="EPG Name" required>
                <input type="text" className={INPUT_CLS} placeholder="e.g. VLAN1413_EPG"
                  value={form.name} onChange={e => updateForm('name', e.target.value)} required autoFocus />
              </FormField>
              <FormField label="Tenant" required>
                <select className={SELECT_CLS} value={form.tenant} onChange={e => updateForm('tenant', e.target.value)}>
                  {TENANTS.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Application Profile" required>
                <select className={SELECT_CLS} value={form.ap} onChange={e => updateForm('ap', e.target.value)}>
                  {(APS[form.tenant] ?? []).map(a => <option key={a}>{a}</option>)}
                </select>
              </FormField>
              <FormField label="Bridge Domain" required hint="The BD must belong to the same tenant">
                <select className={SELECT_CLS} value={form.bd} onChange={e => updateForm('bd', e.target.value)}>
                  {(BDS[form.tenant] ?? []).map(b => <option key={b}>{b}</option>)}
                </select>
              </FormField>

              <div className="border-t border-subtle pt-4 space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                  Policy Settings
                </p>
                {[
                  { key: 'preferredGroup' as const, label: 'Preferred Group Member', hint: 'Include EPG in preferred group (bypass contracts)' },
                  { key: 'isolation' as const,      label: 'Intra-EPG Isolation',    hint: 'Enforce isolation between endpoints in this EPG' },
                ].map(({ key, label, hint }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-foreground">{label}</p>
                      <p className="text-[11px] text-subtle mt-0.5">{hint}</p>
                    </div>
                    <Toggle checked={form[key]} onChange={v => updateForm(key, v)} />
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-subtle bg-muted px-4 py-3">
                <p className="text-[11px] leading-relaxed text-subtle">
                  Static port bindings can be added after creation from the{' '}
                  <span className="font-medium text-muted-foreground">Static Ports</span> section via CSV upload.
                </p>
              </div>
            </form>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-subtle bg-muted px-6 py-4">
              <button type="button" onClick={() => setPanelOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2">
                Cancel
              </button>
              <button type="submit" form="create-epg-form"
                className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors">
                Create EPG
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
