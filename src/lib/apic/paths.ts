import type { ParsedRow } from "./types";

export function buildPathSegment(row: ParsedRow): string {
  if (row.port_type === "vpc") {
    return `topology/pod-1/protpaths-${row.node1}-${row.node2}/pathep-[${row.interface_or_ipg}]`;
  }
  const iface =
    row.port_type === "port" && !row.interface_or_ipg.startsWith("eth")
      ? `eth${row.interface_or_ipg}`
      : row.interface_or_ipg;
  return `topology/pod-1/paths-${row.node1}/pathep-[${iface}]`;
}

export function buildEpgDn(row: ParsedRow): string {
  return `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}`;
}

export function buildEpgPath(row: ParsedRow): string {
  return `/api/node/mo/${buildEpgDn(row)}.json`;
}

export function buildPortPath(row: ParsedRow): string {
  if (row.port_type === "vpc" || row.port_type === "pc") {
    return `/api/node/mo/uni/infra/funcprof/accbundle-${row.interface_or_ipg}.json`;
  }
  return `/api/node/mo/${buildPathSegment(row)}.json`;
}

export function buildNodePath(nodeId: number): string {
  return `/api/node/mo/topology/pod-1/node-${nodeId}.json`;
}

export function buildEncapConflictQuery(row: ParsedRow): string {
  const tDn = buildPathSegment(row);
  return `/api/class/fvRsPathAtt.json?query-target-filter=and(eq(fvRsPathAtt.tDn,"${tDn}"),eq(fvRsPathAtt.encap,"vlan-${row.vlan}"))`;
}

export function buildMoDn(row: ParsedRow): string {
  return `${buildEpgDn(row)}/rspathAtt-[${buildPathSegment(row)}]`;
}

export function buildMoPath(row: ParsedRow): string {
  return `/api/node/mo/${buildMoDn(row)}.json`;
}
