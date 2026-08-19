'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  IconAlertTriangle,
  IconClock,
  IconClockPlay,
  IconPlayerPlay,
  IconTrash,
} from '@tabler/icons-react'
import {
  deleteResyncSchedule,
  refreshResyncSchedules,
  runResyncScheduleNow,
  upsertResyncSchedule,
} from '@/actions/resync-schedules'
import { UNREADABLE_USERNAME, type SafeResyncSchedule } from '@/lib/apic/schedule-view'
import { startSchedulePolling } from '@/lib/apic/schedule-polling'
import { INTERVAL_MAX_MINUTES, INTERVAL_MIN_MINUTES } from '@/lib/apic/schedule-timing'
import {
  DENSE_TABLE_HEAD_CLS,
  INPUT_CLS,
  LABEL_CLS,
  SELECT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

/** Sentinel select value that reveals the custom-minutes input below it. */
const CUSTOM_INTERVAL_VALUE = 'custom'

const PILL_CLS =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]'

/** Mirrors the History page's status palette so a run reads the same wherever it appears. */
const STATUS_STYLES: Record<string, string> = {
  success: 'border-success-border bg-success-bg text-success',
  partial: 'border-warning-border bg-warning-bg text-warning',
  failure: 'border-error-border bg-error-bg text-error',
}

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

function StatusPill({ schedule }: { schedule: SafeResyncSchedule }) {
  if (schedule.isRunning) {
    return (
      <span className={`${PILL_CLS} border-primary/25 bg-primary/10 text-primary`}>
        <IconClock size={11} stroke={1.75} />
        running
      </span>
    )
  }
  if (!schedule.lastStatus) {
    return <span className="text-[10px] text-faint uppercase tracking-[0.08em]">never run</span>
  }
  return (
    <span className={`${PILL_CLS} ${STATUS_STYLES[schedule.lastStatus] ?? STATUS_STYLES.failure}`}>
      {schedule.lastStatus}
    </span>
  )
}

export function SchedulerClient({ initialSchedules }: { initialSchedules: SafeResyncSchedule[] }) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const [editing, setEditing] = useState<SafeResyncSchedule | null>(null)
  const [deleting, setDeleting] = useState<SafeResyncSchedule | null>(null)
  const [isPending, startTransition] = useTransition()

  // Form state for the edit dialog
  const [enabled, setEnabled] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(480)
  const [useCustomInterval, setUseCustomInterval] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => startSchedulePolling({
    load: refreshResyncSchedules,
    onSnapshot: setSchedules,
  }), [])

  const enabledCount = schedules.filter((s) => s.enabled).length
  const attentionCount = schedules.filter((s) => s.isOverdue || s.lastStatus === 'failure').length

  function openEditor(schedule: SafeResyncSchedule) {
    setEditing(schedule)
    setEnabled(schedule.enabled)
    setIntervalMinutes(schedule.intervalMinutes)
    setUseCustomInterval(!INTERVAL_PRESETS.some((p) => p.value === schedule.intervalMinutes))
    setUsername(schedule.username === UNREADABLE_USERNAME ? '' : schedule.username)
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
      replace(result.data)
      toast.success('Run queued — starts within a minute')
    })
  }

  function handleDelete() {
    const schedule = deleting
    if (!schedule) return
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
      setDeleting(null)
      toast.success('Schedule removed')
    })
  }

  return (
    <div className="min-h-full bg-background">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Scheduler</h1>
            <p className="text-xs text-subtle mt-0.5">
              Automatic resyncs per controller, timed from the end of the previous run
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Controllers</p>
            <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
              {schedules.length}
            </p>
            <p className="text-[11px] text-faint mt-1.5">registered APIC hosts</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Scheduled</p>
            <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
              {enabledCount}
            </p>
            <p className="text-[11px] text-faint mt-1.5">resyncing on a schedule</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Needs Attention</p>
            <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
              {attentionCount}
            </p>
            <p className="text-[11px] text-faint mt-1.5">overdue or last run failed</p>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['Controller', 'On', 'Interval', 'Runs As', 'Last Run', 'Next Run', ''].map((header, i) => (
                    <th key={header || `actions-${i}`} className={DENSE_TABLE_HEAD_CLS}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-muted border border-border flex items-center justify-center">
                        <IconClockPlay size={18} stroke={1.5} className="text-faint" />
                      </div>
                      <p className="text-sm text-subtle">No APIC hosts yet</p>
                      <p className="text-xs text-faint mt-1">
                        Add a controller on the APIC Hosts page, then schedule its resyncs here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  schedules.map((s, index) => (
                    <tr
                      key={s.apicHostId}
                      className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
                    >
                      <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                        <div className="font-medium text-foreground">{s.hostName}</div>
                        <div className="font-mono text-[11px] text-faint">{s.host}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Switch
                          aria-label={`Automatic resync for ${s.hostName}`}
                          checked={s.enabled}
                          disabled={isPending || !s.hasPassword || s.username === UNREADABLE_USERNAME}
                          onCheckedChange={(next) => {
                            if (s.username === UNREADABLE_USERNAME) {
                              toast.error('Credentials could not be decrypted — re-enter them before enabling')
                              return
                            }
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
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {s.hasPassword ? `${intervalLabel(s.intervalMinutes)} after completion` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{s.username || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusPill schedule={s} />
                          <span className="text-[11px] text-faint tabular-nums">{relative(s.lastRunAt)}</span>
                        </div>
                        {s.lastDetail ? (
                          <div className="text-[11px] text-faint truncate max-w-[22rem] mt-0.5">{s.lastDetail}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {!s.enabled ? (
                          <span className="text-faint">—</span>
                        ) : s.isOverdue ? (
                          <span className="inline-flex items-center gap-1.5 text-error">
                            <IconAlertTriangle size={12} stroke={1.75} />
                            Overdue — check the ticker
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{relative(s.nextRunAt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={isPending}
                            onClick={() => openEditor(s)}
                            title="Edit schedule"
                            aria-label={`Edit schedule for ${s.hostName}`}
                          >
                            <IconClockPlay size={13} stroke={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={isPending || !s.enabled}
                            onClick={() => handleRunNow(s)}
                            title="Run now"
                            aria-label={`Run resync now for ${s.hostName}`}
                          >
                            <IconPlayerPlay size={13} stroke={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={isPending || !s.hasPassword}
                            onClick={() => setDeleting(s)}
                            title="Remove schedule"
                            aria-label={`Remove schedule for ${s.hostName}`}
                            className="text-faint hover:text-destructive"
                          >
                            <IconTrash size={13} stroke={1.75} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">
              {editing?.hostName} Schedule
            </DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              Resyncs run with these APIC credentials. The interval starts counting when a run finishes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS} htmlFor="schedule-interval">
                Interval
              </label>
              <select
                id="schedule-interval"
                className={SELECT_CLS}
                value={useCustomInterval ? CUSTOM_INTERVAL_VALUE : intervalMinutes}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_INTERVAL_VALUE) {
                    setUseCustomInterval(true)
                    return
                  }
                  setUseCustomInterval(false)
                  setIntervalMinutes(Number(e.target.value))
                }}
              >
                {INTERVAL_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} after completion
                  </option>
                ))}
                <option value={CUSTOM_INTERVAL_VALUE}>custom…</option>
              </select>
              {useCustomInterval ? (
                <input
                  className={`${INPUT_CLS} mt-2`}
                  type="number"
                  min={INTERVAL_MIN_MINUTES}
                  max={INTERVAL_MAX_MINUTES}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  placeholder={`${INTERVAL_MIN_MINUTES}-${INTERVAL_MAX_MINUTES} minutes`}
                  aria-label="Custom interval in minutes"
                />
              ) : null}
            </div>
            <div>
              <label className={LABEL_CLS} htmlFor="schedule-username">
                APIC username
              </label>
              <input
                id="schedule-username"
                className={INPUT_CLS}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL_CLS} htmlFor="schedule-password">
                APIC password {editing?.hasPassword ? '(leave blank to keep the current one)' : ''}
              </label>
              <input
                id="schedule-password"
                className={INPUT_CLS}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              Run automatically
            </label>
          </div>
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={isPending}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? 'Saving…' : 'Save Schedule'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Remove the schedule for &ldquo;{deleting?.hostName}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              Automatic resyncs stop and the stored APIC credentials are deleted. You can schedule this
              controller again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <AlertDialogCancel
              disabled={isPending}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                handleDelete()
              }}
              disabled={isPending}
              className="bg-error text-error-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
