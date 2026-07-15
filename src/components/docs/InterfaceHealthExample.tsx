// Static, non-interactive illustrations used only in the Interface Health docs
// page. They reuse the real dashboard's tokens/classes so the guide matches what
// operators actually see. No hooks — safe to render as server components.
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'

function OperUp() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-dot" />
      up
    </span>
  )
}

interface ExampleRow {
  node: string
  ifName: string
  crcTotal: string
  lastPoll: string
  active: boolean
}

// Mirrors the Counting-CRC view: the CRC column is the windowed total, with the
// latest interval as subtext ("+N last poll" / "0 last poll" / "reset").
const ROWS: ExampleRow[] = [
  { node: '1806', ifName: 'eth1/27', crcTotal: '461', lastPoll: '+4 last poll', active: true },
  { node: '1806', ifName: 'eth1/26', crcTotal: '128', lastPoll: '0 last poll', active: true },
  { node: '1805', ifName: 'eth1/3', crcTotal: '512', lastPoll: 'reset', active: true },
  { node: '1108', ifName: 'eth1/1', crcTotal: '0', lastPoll: '0 last poll', active: false },
]

export function CrcTableExample() {
  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {['Node', 'Interface', 'Oper', 'Speed', 'CRC (7d)'].map((h) => (
              <th key={h} className={DENSE_TABLE_HEAD_CLS}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.ifName} className="border-b border-border-faint last:border-0">
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.node}</td>
              <td className="px-4 py-2.5 font-mono text-foreground">{r.ifName}</td>
              <td className="px-4 py-2.5">
                <OperUp />
              </td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">10G</td>
              <td className="px-4 py-2.5 tabular-nums">
                <div className={r.active ? 'font-semibold text-danger' : 'text-faint'}>
                  {r.crcTotal}
                </div>
                <div className="mt-0.5 text-[10px] font-normal text-faint">{r.lastPoll}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Heights are illustrative (percent of plot area). `null` = a gap with no sample.
const BARS: (number | null)[] = [55, 48, 18, null, 58, 58, 27, 76, null, 42]
const RESET_INDEX = 3 // dashed rule sits before the post-reset bar
const GAP_INDEX = 8 // shaded slot = missing samples

export function TrendChartExample() {
  return (
    <div className="my-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-32 items-end gap-1.5">
        {BARS.map((h, i) => (
          <div key={i} className="relative flex h-full flex-1 items-end">
            {i === GAP_INDEX && (
              <span className="absolute inset-0 rounded-sm bg-muted-foreground/10" />
            )}
            {i === RESET_INDEX && (
              <span className="absolute inset-y-0 left-0 border-l border-dashed border-muted-foreground/60" />
            )}
            {h !== null && (
              <span
                className="w-full rounded-sm"
                style={{ height: `${h}%`, background: 'var(--chart-3)' }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: 'var(--chart-3)' }} />
          CRC errors this interval
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0 border-l border-dashed border-muted-foreground/60" />
          Counter reset
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-muted-foreground/10" />
          No data (missing samples)
        </span>
      </div>
    </div>
  )
}
