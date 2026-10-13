import { isIpv4, sortedIps, type Service } from './policy'

export type ParsedService = { ips: string[]; reason: string | null }
export type ParsedConfig = Record<Service, ParsedService>

/** Only addresses are returned: config keys and unrelated sections stay on the server. */
export function parseRunningConfig(rawConfig: string, platform: string): ParsedConfig {
  const unknown = (reason: string): ParsedConfig => ({
    ntp: { ips: [], reason },
    tacacs: { ips: [], reason },
  })
  if (platform !== 'iosxe' && platform !== 'nxos')
    return unknown('Missing or unsupported configuration platform')
  if (!rawConfig.trim()) return unknown('Saved configuration is empty')
  // Banners can contain arbitrary command-looking text, including server IPs.
  const lines: string[] = []
  let delimiter: string | null = null
  for (const line of rawConfig.replace(/\r\n?/g, '\n').split('\n')) {
    if (delimiter) {
      if (line.includes(delimiter)) delimiter = null
      continue
    }
    const banner = line
      .trim()
      .match(/^banner\s+(?:motd|login|exec|incoming|slip-ppp|prompt-timeout)\s+(\^.|\S)(.*)$/i)
    if (banner) {
      if (!banner[2].includes(banner[1])) delimiter = banner[1]
      continue
    }
    lines.push(line)
  }
  if (delimiter) return unknown('Saved configuration contains an incomplete banner')
  const text = lines.join('\n')
  if (
    /--\s*More\s*--|^\s*%\s*(?:Invalid|Error|Incomplete|Ambiguous)|^\s*(?:connection (?:closed|timed out)|permission denied)/im.test(
      text,
    )
  ) {
    return unknown('Saved configuration contains a collection error or incomplete output')
  }
  if (
    !/^\s*(?:version\s|hostname\s|aaa\s|ntp\s|tacacs(?:-server)?\s|feature\s|interface\s|ip\s|router\s|boot\s|line\s|service\s|username\s|enable\s|end\s*$)/im.test(
      text,
    )
  ) {
    return unknown('Saved text is not a recognizable running configuration')
  }

  const ips = { ntp: new Set<string>(), tacacs: new Set<string>() }
  const reasons: Record<Service, string | null> = { ntp: null, tacacs: null }
  const namedServers = new Map<string, boolean>()
  const references = new Set<string>()
  let context: 'group' | 'named' | null = null
  let serverName: string | null = null
  const add = (service: Service, address: string | undefined) => {
    if (!address || !isIpv4(address)) {
      reasons[service] =
        `${service === 'ntp' ? 'NTP' : 'TACACS'} contains a missing or unsupported server address; only IPv4 is supported`
      return
    }
    ips[service].add(address)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('!') || line === 'exit' || line === 'end') {
      context = null
      serverName = null
      continue
    }
    if (/^aaa group server tacacs\+\s+/i.test(line)) {
      context = 'group'
      serverName = null
      continue
    }
    const named = platform === 'iosxe' ? line.match(/^tacacs server\s+(\S+)$/i) : null
    if (named) {
      context = 'named'
      serverName = named[1]
      namedServers.set(serverName, false)
      continue
    }
    // Cisco emits indented subcommands; a new top-level command leaves the block.
    if (!/^\s/.test(rawLine)) {
      context = null
      serverName = null
    }
    if (/^no\s/i.test(line)) continue

    if (/^ntp server(?:\s|$)/i.test(line)) {
      const tokens = line.split(/\s+/)
      add('ntp', platform === 'iosxe' && tokens[2]?.toLowerCase() === 'vrf' ? tokens[4] : tokens[2])
    } else if (/^tacacs-server host(?:\s|$)/i.test(line)) {
      add('tacacs', line.split(/\s+/)[2])
    } else if (context === 'group' && /^server-private(?:\s|$)/i.test(line)) {
      add('tacacs', line.split(/\s+/)[1])
    } else if (context === 'group' && /^server(?:\s|$)/i.test(line)) {
      const tokens = line.split(/\s+/)
      const address = tokens[1]
      if (platform === 'iosxe' && address === 'name' && tokens[2]) references.add(tokens[2])
      else if (
        platform === 'iosxe' &&
        address &&
        !isIpv4(address) &&
        !address.includes(':') &&
        !/^\d/.test(address)
      )
        references.add(address)
      else add('tacacs', address)
    } else if (context === 'named' && /^address(?:\s|$)/i.test(line)) {
      const tokens = line.split(/\s+/)
      if (tokens[1]?.toLowerCase() === 'ipv4') {
        add('tacacs', tokens[2])
        if (serverName && isIpv4(tokens[2] ?? '')) namedServers.set(serverName, true)
      } else
        reasons.tacacs = 'TACACS contains an unsupported server address; only IPv4 is supported'
    }
  }
  if (
    [...references].some((name) => !namedServers.get(name)) ||
    [...namedServers.values()].some((valid) => !valid)
  ) {
    reasons.tacacs ??=
      'TACACS contains an unresolved named server or a server without an IPv4 address'
  }
  return {
    ntp: { ips: sortedIps(ips.ntp), reason: reasons.ntp },
    tacacs: { ips: sortedIps(ips.tacacs), reason: reasons.tacacs },
  }
}
