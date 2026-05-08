import { apicFetch } from '@/lib/apic/client'
import {
  bridgeDomainL3Payload,
  buildBridgeDomainPath,
  buildSubnetPath,
  l3OutAttachmentPayload,
  subnetPayload,
} from '@/lib/apic/bridge-domains/paths'
import { runParallel } from '@/lib/apic/parallel'
import type {
  BridgeDomainDeployResult,
  ParsedBridgeDomainL3Row,
} from '@/lib/apic/bridge-domains/types'

async function postApic(
  host: string,
  path: string,
  body: string,
  token: string,
  stage: string,
): Promise<string | null> {
  const res = await apicFetch(host, path, { method: 'POST', body, token })
  if (res.ok) return null
  const text = await res.text()
  return `${stage} failed (APIC ${res.status}): ${text.slice(0, 200)}`
}

export async function POST(request: Request): Promise<Response> {
  let rows: ParsedBridgeDomainL3Row[], apicHost: string, apicToken: string
  try {
    ;({ rows, apicHost, apicToken } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!Array.isArray(rows)) {
    return Response.json({ error: 'rows is required' }, { status: 400 })
  }
  if (!apicHost || !apicToken) {
    return Response.json({ error: 'apicHost and apicToken are required' }, { status: 400 })
  }

  const results = await runParallel<ParsedBridgeDomainL3Row, BridgeDomainDeployResult>(rows, 5, async (row) => {
    try {
      const bdPath = buildBridgeDomainPath(row.tenant, row.bd)

      const bdError = await postApic(apicHost, bdPath, bridgeDomainL3Payload(row), apicToken, 'Bridge domain deploy')
      if (bdError) return { rowIndex: row.rowIndex, success: false, message: bdError }

      const subnetError = await postApic(apicHost, buildSubnetPath(row.tenant, row.bd, row.subnet), subnetPayload(row), apicToken, 'Subnet deploy')
      if (subnetError) return { rowIndex: row.rowIndex, success: false, message: subnetError }

      const l3outError = await postApic(apicHost, bdPath, l3OutAttachmentPayload(row), apicToken, 'L3Out attachment')
      if (l3outError) return { rowIndex: row.rowIndex, success: false, message: l3outError }

      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })

  return Response.json({ results })
}
