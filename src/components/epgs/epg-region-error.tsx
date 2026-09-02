export function EpgRegionError({ region, compact = false }: { region: 'overview' | 'results'; compact?: boolean }) {
  return <div className={compact ? 'text-xs text-destructive' : 'rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive'}>Unable to load EPG {region}.</div>
}
