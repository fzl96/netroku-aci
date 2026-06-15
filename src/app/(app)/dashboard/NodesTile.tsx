import Link from 'next/link'
import { IconServer2 } from '@tabler/icons-react'
import { getNodeSummary } from '@/actions/nodes'

export async function NodesTile() {
  const { nodesOnline, nodesTotal, componentsFailed } = await getNodeSummary()
  const allOnline = nodesTotal > 0 && nodesOnline === nodesTotal
  const onlineColor =
    nodesTotal === 0
      ? 'text-muted-foreground'
      : allOnline
        ? 'text-green-600'
        : 'text-amber-500'

  return (
    <Link
      href="/nodes"
      className="block rounded-2xl border border-border bg-card shadow-sm p-5 hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm font-semibold text-foreground">Nodes</h3>
        <IconServer2 size={16} stroke={1.75} className="text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-baseline gap-4">
        <span className={`text-2xl font-semibold ${onlineColor}`}>
          {nodesTotal === 0 ? '-' : `${nodesOnline}/${nodesTotal}`}
        </span>
        <span className="text-sm text-subtle">
          <span className={componentsFailed > 0 ? 'text-red-600' : 'text-muted-foreground'}>
            {componentsFailed}
          </span>{' '}
          failed HW
        </span>
      </div>
      <p className="text-xs text-subtle mt-1">nodes online / total</p>
    </Link>
  )
}
