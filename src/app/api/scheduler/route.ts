import { getResyncSchedules, SchedulerReadError } from '@/lib/scheduler/query'
import { serializeSchedulePollingSnapshot } from '@/lib/scheduler/polling-wire'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const schedules = await getResyncSchedules()
    return Response.json(
      { data: serializeSchedulePollingSnapshot(schedules) },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    const unauthorized = error instanceof SchedulerReadError && error.code === 'unauthorized'
    return Response.json(
      { error: unauthorized ? 'Unauthorized' : 'Unable to load resync schedules' },
      { status: unauthorized ? 401 : 503, headers: NO_STORE_HEADERS },
    )
  }
}
