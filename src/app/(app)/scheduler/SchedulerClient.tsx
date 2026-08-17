'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { IconClockPlay, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import {
  deleteResyncSchedule,
  runResyncScheduleNow,
  upsertResyncSchedule,
} from '@/actions/resync-schedules'
import type { SafeResyncSchedule } from '@/lib/apic/schedule-view'
import { INPUT_CLS, LABEL_CLS, SELECT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'

const INTERVAL_PRESETS = [
  { label: 'every 15m', value: 15 },
  { label: 'every 30m', value: 30 },
  { label: 'every 1h', value: 60 },
  { label: 'every 4h', value: 240 },
  { label: 'every 8h', value: 480 },
  { label: 'every 24h', value: 1440 },
]

function intervalLabel(minutes: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.value === minutes)
  if (preset) return preset.label
  return `every ${minutes}m`
}

function relative(date: Date | null): string {
  if (!date) return '—'
  const deltaMs = new Date(date).getTime() - Date.now()
  const past = deltaMs < 0
  const mins = Math.round(Math.abs(deltaMs) / 60_000)
  const text = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`
  return past ? `${text} ago` : `in ${text}`
}

function statusBadge(schedule: SafeResyncSchedule) {
  if (schedule.isRunning) return <Badge variant="secondary">running…</Badge>
  if (!schedule.lastStatus) return <span className="text-faint">never run</span>
  const variant =
    schedule.lastStatus === 'success' ? 'default' : schedule.lastStatus === 'partial' ? 'secondary' : 'destructive'
  return <Badge variant={variant}>{schedule.lastStatus}</Badge>
}

export function SchedulerClient({ initialSchedules }: { initialSchedules: SafeResyncSchedule[] }) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const [editing, setEditing] = useState<SafeResyncSchedule | null>(null)
  const [isPending, startTransition] = useTransition()

  // Form state for the edit dialog
  const [enabled, setEnabled] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(480)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function openEditor(schedule: SafeResyncSchedule) {
    setEditing(schedule)
    setEnabled(schedule.enabled)
    setIntervalMinutes(schedule.intervalMinutes)
    setUsername(schedule.username === '(unreadable)' ? '' : schedule.username)
    setPassword('')
  }

  function replace(updated: SafeResyncSchedule) {
    setSchedules((prev) => prev.map((s) => (s.apicHostId === updated.apicHostId ? updated : s)))
  }

  function handleSave() {
    if (!editing) return
    startTransition(async () => {
      const result = await upsertResyncSchedule(editing.apicHostId, {
        enabled,
        intervalMinutes,
        username,
        password: password || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      replace(result.data)
      setEditing(null)
      toast.success('Schedule saved')
    })
  }

  function handleRunNow(schedule: SafeResyncSchedule) {
    startTransition(async () => {
      const result = await runResyncScheduleNow(schedule.apicHostId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Run queued — starts within a minute')
    })
  }

  function handleDelete(schedule: SafeResyncSchedule) {
    startTransition(async () => {
      const result = await deleteResyncSchedule(schedule.apicHostId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      replace({
        ...schedule,
        enabled: false,
        hasPassword: false,
        username: '',
        nextRunAt: null,
        lastRunAt: null,
        lastStatus: null,
        lastDetail: null,
        isRunning: false,
        isOverdue: false,
      })
      toast.success('Schedule removed')
    })
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Scheduler</h1>
            <p className="text-xs text-subtle mt-0.5">
              Automatic resyncs per controller. Intervals are measured from the end of the previous run.
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {schedules.length === 0 ? (
          <p className="text-sm text-subtle">
            No APIC hosts registered yet. Add one on the APIC Hosts page first.
          </p>
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Host</th>
                  <th className="py-2 pr-4">Enabled</th>
                  <th className="py-2 pr-4">Interval</th>
                  <th className="py-2 pr-4">Runs as</th>
                  <th className="py-2 pr-4">Last run</th>
                  <th className="py-2 pr-4">Next run</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.apicHostId} className="border-t border-border">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-foreground">{s.hostName}</div>
                      <div className="text-xs text-faint">{s.host}</div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Switch
                        checked={s.enabled}
                        disabled={isPending || !s.hasPassword}
                        onCheckedChange={(next) => {
                          startTransition(async () => {
                            const result = await upsertResyncSchedule(s.apicHostId, {
                              enabled: next,
                              intervalMinutes: s.intervalMinutes,
                              username: s.username,
                              password: undefined,
                            })
                            if (!result.success) {
                              toast.error(result.error)
                              return
                            }
                            replace(result.data)
                          })
                        }}
                      />
                    </td>
                    <td className="py-2.5 pr-4 text-foreground">
                      {s.hasPassword ? `${intervalLabel(s.intervalMinutes)} after completion` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground">{s.username || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        {statusBadge(s)}
                        <span className="text-xs text-faint">{relative(s.lastRunAt)}</span>
                      </div>
                      {s.lastDetail ? (
                        <div className="text-xs text-faint truncate max-w-[22rem]">{s.lastDetail}</div>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4">
                      {s.enabled ? (
                        <span className={s.isOverdue ? 'text-destructive' : 'text-foreground'}>
                          {s.isOverdue ? 'overdue — is the ticker running?' : relative(s.nextRunAt)}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => openEditor(s)}>
                          <IconClockPlay size={15} stroke={1.75} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending || !s.enabled}
                          onClick={() => handleRunNow(s)}
                        >
                          <IconPlayerPlay size={15} stroke={1.75} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending || !s.hasPassword}
                          onClick={() => handleDelete(s)}
                        >
                          <IconTrash size={15} stroke={1.75} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.hostName} schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Interval</label>
              <select
                className={SELECT_CLS}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              >
                {INTERVAL_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} after completion
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>APIC username</label>
              <input className={INPUT_CLS} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>
                APIC password {editing?.hasPassword ? '(leave blank to keep the current one)' : ''}
              </label>
              <input
                className={INPUT_CLS}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              Enabled
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
