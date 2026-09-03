import type { EpgPageParams } from '@/lib/epgs/params'
import { resolveEpgHost } from '@/lib/epgs/query'
import { EpgShell } from './epg-shell'

export function EpgsView({ paramsPromise }: { paramsPromise: Promise<EpgPageParams> }) {
  const hostPromise = paramsPromise.then((params) => resolveEpgHost(params.hostId))

  return <EpgShell paramsPromise={paramsPromise} hostPromise={hostPromise} />
}
