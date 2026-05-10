import { apicFetch } from './client'

export interface ApicEndpointRow {
  mac: string
  ip: string
  vlan: string
  dn: string
  node: string
  interface: string
  epgDescr: string
}

interface FvCEpAttrs {
  mac: string
  encap: string
  fabricPathDn: string
  dn: string
}

interface FvIpAttrs {
  addr: string
}

interface FvAEPgAttrs {
  dn: string
  descr: string
}

const FABRIC_PATH_RE = /topology\/pod-\d+\/paths-(\d+)\/pathep-\[([^\]]+)\]/

function parsePathDn(fabricPathDn: string): { node: string; iface: string } {
  const m = FABRIC_PATH_RE.exec(fabricPathDn)
  if (!m) return { node: '', iface: '' }
  return { node: m[1], iface: m[2] }
}

async function apicGet(host: string, token: string, path: string): Promise<unknown[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = await res.json() as { imdata: unknown[] }
  return data.imdata ?? []
}

export async function fetchEndpointsFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<ApicEndpointRow[]> {
  // Authenticate
  const loginRes = await apicFetch(host, '/api/aaaLogin.json', {
    method: 'POST',
    body: JSON.stringify({ aaaUser: { attributes: { name: username, pwd: plaintextPassword } } }),
  })
  if (!loginRes.ok) throw new Error(`APIC authentication failed: ${loginRes.status}`)
  const loginData = await loginRes.json() as { imdata: Array<{ aaaLogin?: { attributes: { token: string } } }> }
  const token = loginData.imdata[0]?.aaaLogin?.attributes?.token
  if (!token) throw new Error('No token in APIC login response')

  // Fetch endpoints and EPGs in parallel
  const [epRaw, epgRaw] = await Promise.all([
    apicGet(host, token, '/api/node/class/fvCEp.json?rsp-subtree=children&rsp-subtree-class=fvIp'),
    apicGet(host, token, '/api/node/class/fvAEPg.json'),
  ])

  // Build EPG DN → description map
  const epgDescrMap = new Map<string, string>()
  for (const item of epgRaw) {
    const attrs = (item as { fvAEPg?: { attributes: FvAEPgAttrs } }).fvAEPg?.attributes
    if (attrs) epgDescrMap.set(attrs.dn, attrs.descr ?? '')
  }

  // Find EPG description by endpoint DN (dn looks like: uni/tn-X/ap-Y/epg-Z/cep-MAC)
  function epgDescrForDn(dn: string): string {
    // Strip the endpoint suffix to get the EPG DN: uni/tn-X/ap-Y/epg-Z
    const epgDn = dn.replace(/\/cep-[^/]+$/, '')
    return epgDescrMap.get(epgDn) ?? ''
  }

  const rows: ApicEndpointRow[] = []

  for (const item of epRaw) {
    const epObj = item as {
      fvCEp?: {
        attributes: FvCEpAttrs
        children?: Array<{ fvIp?: { attributes: FvIpAttrs } }>
      }
    }
    const ep = epObj.fvCEp
    if (!ep) continue

    const { mac, encap, fabricPathDn, dn } = ep.attributes
    const { node, iface } = parsePathDn(fabricPathDn)
    const vlan = encap
    const epgDescr = epgDescrForDn(dn)

    // Collect IP addresses from children
    const ips: string[] = []
    if (ep.children) {
      for (const child of ep.children) {
        const addr = child.fvIp?.attributes?.addr
        if (addr && addr !== '0.0.0.0') ips.push(addr)
      }
    }

    if (ips.length === 0) {
      rows.push({ mac: mac.toLowerCase(), ip: '', vlan, dn, node, interface: iface, epgDescr })
    } else {
      for (const ip of ips) {
        rows.push({ mac: mac.toLowerCase(), ip, vlan, dn, node, interface: iface, epgDescr })
      }
    }
  }

  return rows
}
