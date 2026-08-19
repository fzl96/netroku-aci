import { DeviceStatus, StackRole } from '@prisma/client'

export type RawCsvRow = Record<string, string>

export type ParsedImportRow = {
  rowIndex: number
  hostname: string
  serialNumber: string
  assetTag: string | null
  managementIp: string | null
  status: DeviceStatus
  vendor: string
  model: string
  heightU: number
  site: string | null
  rack: string | null
  rackPosition: number | null
  stackName: string | null
  stackRole: StackRole | null
  switchId: number | null
}

export type CsvImportError = {
  rowIndex: number
  field: string
  message: string
}

export type MalformedImportRow = {
  rowIndex: number
  hostname: string
  serialNumber: string
  assetTag: string | null
  managementIp: string | null
  vendor: string
  model: string
  heightU: number
  site: string | null
  rack: string | null
  rackPosition: number | null
  stackName: string | null
  errors: string[]
}

export type CsvParseResult = {
  rows: ParsedImportRow[]
  errors: CsvImportError[]
  malformedRows: MalformedImportRow[]
}

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  hostname: 'hostname',
  name: 'hostname',
  host: 'hostname',
  device_name: 'hostname',

  serial_number: 'serialNumber',
  serial: 'serialNumber',
  serialnumber: 'serialNumber',
  sn: 'serialNumber',

  asset_tag: 'assetTag',
  assettag: 'assetTag',
  asset: 'assetTag',
  tag: 'assetTag',

  management_ip: 'managementIp',
  managementip: 'managementIp',
  mgmt_ip: 'managementIp',
  mgmtip: 'managementIp',
  ip_address: 'managementIp',
  ipaddress: 'managementIp',
  ip: 'managementIp',

  status: 'status',
  state: 'status',

  vendor: 'vendor',
  manufacturer: 'vendor',
  make: 'vendor',

  model: 'model',
  device_model: 'model',

  height_u: 'heightU',
  height: 'heightU',
  u_height: 'heightU',
  u: 'heightU',

  site: 'site',
  site_name: 'site',
  sitename: 'site',

  rack: 'rack',
  rack_name: 'rack',
  rackname: 'rack',

  rack_position: 'rackPosition',
  rackposition: 'rackPosition',
  unit: 'rackPosition',
  position: 'rackPosition',
  u_pos: 'rackPosition',
  u_position: 'rackPosition',

  stack_name: 'stackName',
  stackname: 'stackName',
  stack: 'stackName',

  stack_role: 'stackRole',
  stackrole: 'stackRole',
  role: 'stackRole',

  switch_id: 'switchId',
  switchid: 'switchId',
  switch_number: 'switchId',
  sw_number: 'switchId',
  stack_member: 'switchId',
  stackmember: 'switchId',
  member: 'switchId',
}

export function normalizeHeaderName(rawHeader: string): string {
  return rawHeader.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function checkRequiredHeaders(headers: string[]): CsvImportError | null {
  const normalized = headers.map(normalizeHeaderName)
  const canonicalPresent = new Set<string>()

  for (const h of normalized) {
    const canon = HEADER_ALIASES[h]
    if (canon) canonicalPresent.add(canon)
  }

  const missing: string[] = []
  if (!canonicalPresent.has('hostname')) missing.push('hostname (or name)')
  if (!canonicalPresent.has('serialNumber')) missing.push('serial_number (or serial)')
  if (!canonicalPresent.has('vendor')) missing.push('vendor')
  if (!canonicalPresent.has('model')) missing.push('model')

  if (missing.length > 0) {
    return {
      rowIndex: 0,
      field: 'headers',
      message: `Missing required column(s): ${missing.join(', ')}`,
    }
  }

  return null
}

export function parseCsvRows(rawRows: RawCsvRow[], headers: string[]): CsvParseResult {
  const headerError = checkRequiredHeaders(headers)
  if (headerError) {
    return { rows: [], errors: [headerError], malformedRows: [] }
  }

  // Create header lookup map
  const headerMap = new Map<string, keyof ParsedImportRow>()
  for (const h of headers) {
    const norm = normalizeHeaderName(h)
    const canon = HEADER_ALIASES[norm]
    if (canon) {
      headerMap.set(h, canon)
    }
  }

  const rows: ParsedImportRow[] = []
  const errors: CsvImportError[] = []
  const malformedRows: MalformedImportRow[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const rowErrors: CsvImportError[] = []
    const addErr = (field: string, message: string) => rowErrors.push({ rowIndex, field, message })

    // Extract normalized fields from raw row
    const extracted: Record<string, string> = {}
    for (const [header, val] of Object.entries(raw)) {
      const canon = headerMap.get(header)
      if (canon && val !== undefined && val !== null) {
        extracted[canon] = String(val).trim()
      }
    }

    // Skip accidental repeated header rows inside data
    if (
      extracted.hostname?.toLowerCase() === 'hostname' &&
      (extracted.serialNumber?.toLowerCase() === 'serial_number' ||
        extracted.serialNumber?.toLowerCase() === 'serial')
    ) {
      return
    }

    // Validate hostname
    const hostname = extracted.hostname ?? ''
    if (!hostname) {
      addErr('hostname', 'Hostname is required')
    } else if (hostname.length > 128) {
      addErr('hostname', 'Hostname must be 128 characters or fewer')
    }

    // Validate serialNumber
    const serialNumber = extracted.serialNumber ?? ''
    if (!serialNumber) {
      addErr('serialNumber', 'Serial number is required')
    } else if (serialNumber.length > 128) {
      addErr('serialNumber', 'Serial number must be 128 characters or fewer')
    }

    // Validate assetTag
    const assetTag = extracted.assetTag || null
    if (assetTag && assetTag.length > 128) {
      addErr('assetTag', 'Asset tag must be 128 characters or fewer')
    }

    // Validate managementIp
    const managementIp = extracted.managementIp || null
    if (managementIp) {
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
      const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/
      if (!ipv4Regex.test(managementIp) && !ipv6Regex.test(managementIp)) {
        addErr('managementIp', `Invalid IP address "${managementIp}". Must be a valid IPv4 or IPv6 address`)
      }
    }

    // Validate status
    let status: DeviceStatus = DeviceStatus.ACTIVE
    const rawStatus = (extracted.status ?? '').toUpperCase()
    if (rawStatus) {
      if (rawStatus in DeviceStatus) {
        status = rawStatus as DeviceStatus
      } else {
        addErr('status', `Invalid status "${extracted.status}". Allowed: ACTIVE, PLANNED, MAINTENANCE, RETIRED`)
      }
    }

    // Validate vendor
    const vendor = extracted.vendor ?? ''
    if (!vendor) {
      addErr('vendor', 'Vendor is required')
    } else if (vendor.length > 128) {
      addErr('vendor', 'Vendor must be 128 characters or fewer')
    }

    // Validate model
    const model = extracted.model ?? ''
    if (!model) {
      addErr('model', 'Model is required')
    } else if (model.length > 128) {
      addErr('model', 'Model must be 128 characters or fewer')
    }

    // Validate heightU
    let heightU = 1
    if (extracted.heightU) {
      const parsedH = parseInt(extracted.heightU, 10)
      if (isNaN(parsedH) || parsedH < 1 || parsedH > 60) {
        addErr('heightU', `Height must be between 1 and 60 U, got "${extracted.heightU}"`)
      } else {
        heightU = parsedH
      }
    }

    // Validate site & rack
    const site = extracted.site || null
    const rack = extracted.rack || null
    let rackPosition: number | null = null

    if (extracted.rackPosition) {
      const parsedPos = parseInt(extracted.rackPosition, 10)
      if (isNaN(parsedPos) || parsedPos < 1) {
        addErr('rackPosition', `Rack position must be a positive integer, got "${extracted.rackPosition}"`)
      } else {
        rackPosition = parsedPos
      }
    }

    if (rackPosition !== null && !rack) {
      addErr('rack', 'Rack name is required when specifying a rack position')
    }

    // Validate stack
    const stackName = extracted.stackName || null
    let stackRole: StackRole | null = null
    let switchId: number | null = null

    if (extracted.stackRole) {
      const rawRole = extracted.stackRole.toUpperCase()
      if (rawRole in StackRole) {
        stackRole = rawRole as StackRole
      } else {
        addErr('stackRole', `Invalid stack role "${extracted.stackRole}". Allowed: MASTER, MEMBER`)
      }
    }

    if (extracted.switchId) {
      const parsedSw = parseInt(extracted.switchId, 10)
      if (isNaN(parsedSw) || parsedSw < 1 || parsedSw > 32) {
        addErr('switchId', `Switch number must be between 1 and 32, got "${extracted.switchId}"`)
      } else {
        switchId = parsedSw
      }
    }

    if ((stackRole !== null || switchId !== null) && !stackName) {
      addErr('stackName', 'Stack name is required when stack role or switch number is specified')
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      malformedRows.push({
        rowIndex,
        hostname: hostname || '(empty)',
        serialNumber: serialNumber || '(empty)',
        assetTag,
        managementIp,
        vendor: vendor || '—',
        model: model || '—',
        heightU,
        site,
        rack,
        rackPosition,
        stackName,
        errors: rowErrors.map((e) => e.message),
      })
    } else {
      rows.push({
        rowIndex,
        hostname,
        serialNumber,
        assetTag,
        managementIp,
        status,
        vendor,
        model,
        heightU,
        site,
        rack,
        rackPosition,
        stackName,
        stackRole,
        switchId,
      })
    }
  })

  // Check intra-CSV duplicates and collisions
  validateIntraCsvConstraints(rows, errors)

  return { rows, errors, malformedRows }
}

function validateIntraCsvConstraints(rows: ParsedImportRow[], errors: CsvImportError[]) {
  // 1. Check duplicate serial numbers within the CSV
  const seenSerials = new Map<string, number>()
  for (const row of rows) {
    const key = row.serialNumber.toLowerCase()
    const firstRow = seenSerials.get(key)
    if (firstRow !== undefined) {
      errors.push({
        rowIndex: row.rowIndex,
        field: 'serialNumber',
        message: `Duplicate serial number "${row.serialNumber}" (already defined at row ${firstRow})`,
      })
    } else {
      seenSerials.set(key, row.rowIndex)
    }
  }

  // 2. Check duplicate asset tags within the CSV (if present)
  const seenTags = new Map<string, number>()
  for (const row of rows) {
    if (!row.assetTag) continue
    const key = row.assetTag.toLowerCase()
    const firstRow = seenTags.get(key)
    if (firstRow !== undefined) {
      errors.push({
        rowIndex: row.rowIndex,
        field: 'assetTag',
        message: `Duplicate asset tag "${row.assetTag}" (already defined at row ${firstRow})`,
      })
    } else {
      seenTags.set(key, row.rowIndex)
    }
  }

  // 3. Check duplicate management IPs within the CSV (if present)
  // Devices in the same stack are allowed to share the stack's management IP
  const seenIps = new Map<string, { rowIndex: number; hostname: string; stackName: string | null }>()
  for (const row of rows) {
    if (!row.managementIp) continue
    const key = row.managementIp.toLowerCase()
    const firstRow = seenIps.get(key)
    if (firstRow !== undefined) {
      const isSameStack = Boolean(
        row.stackName &&
          firstRow.stackName &&
          row.stackName.toLowerCase() === firstRow.stackName.toLowerCase(),
      )
      if (!isSameStack) {
        errors.push({
          rowIndex: row.rowIndex,
          field: 'managementIp',
          message: `Duplicate management IP "${row.managementIp}" (already used by row ${firstRow.rowIndex} "${firstRow.hostname}")`,
        })
      }
    } else {
      seenIps.set(key, {
        rowIndex: row.rowIndex,
        hostname: row.hostname,
        stackName: row.stackName,
      })
    }
  }

  // 4. Check intra-CSV rack placement collisions
  type PlacedUnit = { rowIndex: number; hostname: string; heightU: number; topU: number; bottomU: number }
  const rackPlacements = new Map<string, PlacedUnit[]>()

  for (const row of rows) {
    if (row.rack && row.rackPosition !== null) {
      const rackKey = `${(row.site ?? '').toLowerCase()}::${row.rack.toLowerCase()}`
      const bottomU = row.rackPosition
      const topU = row.rackPosition + row.heightU - 1

      const list = rackPlacements.get(rackKey) ?? []
      for (const placed of list) {
        // Check overlap [bottomU, topU] with [placed.bottomU, placed.topU]
        if (bottomU <= placed.topU && topU >= placed.bottomU) {
          errors.push({
            rowIndex: row.rowIndex,
            field: 'rackPosition',
            message: `Rack collision with row ${placed.rowIndex} ("${placed.hostname}") at U${bottomU}${row.heightU > 1 ? `–U${topU}` : ''}`,
          })
        }
      }
      list.push({ rowIndex: row.rowIndex, hostname: row.hostname, heightU: row.heightU, topU, bottomU })
      rackPlacements.set(rackKey, list)
    }
  }

  // 5. Check duplicate switchId in same stack within CSV
  const stackSwitches = new Map<string, Map<number, number>>()
  for (const row of rows) {
    if (row.stackName && row.switchId !== null) {
      const stackKey = row.stackName.toLowerCase()
      const switchMap = stackSwitches.get(stackKey) ?? new Map<number, number>()
      const firstRow = switchMap.get(row.switchId)
      if (firstRow !== undefined) {
        errors.push({
          rowIndex: row.rowIndex,
          field: 'switchId',
          message: `Duplicate switch #${row.switchId} in stack "${row.stackName}" (already used by row ${firstRow})`,
        })
      } else {
        switchMap.set(row.switchId, row.rowIndex)
        stackSwitches.set(stackKey, switchMap)
      }
    }
  }
}

export const SAMPLE_CSV_TEMPLATE = `hostname,serial_number,asset_tag,management_ip,status,vendor,model,height_u,site,rack,rack_position,stack_name,stack_role,switch_id
DCI-SPINE-01,FOX220199A1,TAG-1001,10.0.1.1,ACTIVE,Arista,DCS-7050SX3-48YC8,1,DCI,C1,42,,,
DCI-SPINE-02,FOX220199A2,TAG-1002,10.0.1.2,ACTIVE,Arista,DCS-7050SX3-48YC8,1,DCI,C1,41,,,
DCI-LEAF-01,FOC240101AA,TAG-1003,10.0.1.11,ACTIVE,Cisco,Nexus 9336C-FX2,2,DCI,C1,30,,,
DCI-LEAF-02,FOC240101BB,TAG-1004,10.0.1.12,ACTIVE,Cisco,Nexus 9336C-FX2,2,DCI,C1,28,,,
DCI-CORE-RTR-01,TTM280302D1,TAG-1005,10.0.0.1,ACTIVE,Cisco,C8500-12X,2,DCI,C1,10,,,
DCI-FW-01,FG100FTK21001,TAG-1006,10.0.254.1,ACTIVE,Fortinet,FortiGate-100F,1,DCI,D1,40,,,
DCI-FW-02,FG100FTK21002,TAG-1007,10.0.254.2,ACTIVE,Fortinet,FortiGate-100F,1,DCI,D1,39,,,
DCI-CORE-RTR-02,TTM280302D2,TAG-1008,10.0.0.2,ACTIVE,Cisco,C8500-12X,2,DCI,D1,20,,,
DCN-SPINE-01,FOX230110X1,TAG-2001,10.10.1.1,PLANNED,Arista,DCS-7050SX3-48YC8,1,DC-NORTH,RACK-N01,42,,,
DCN-LEAF-01,JAE270110A1,TAG-2002,10.10.1.11,PLANNED,Cisco,C9300-48UXM,1,DC-NORTH,RACK-N01,35,,,
DCN-LEAF-02,JAE270110A2,TAG-2003,10.10.1.12,PLANNED,Cisco,C9300-48UXM,1,DC-NORTH,RACK-N01,34,,,
DCN-OOB-SW-01,CN0M311001A,TAG-2004,10.10.250.1,ACTIVE,Dell,PowerSwitch S5248F,1,DC-NORTH,RACK-N02,30,,,
HQ-ACC-STK-01,FOC251001A1,TAG-3001,10.20.10.1,ACTIVE,Cisco,C9200L-48T-4X-E,1,HQ-CAMPUS,MDF-01,40,HQ-ACC-STACK,MASTER,1
HQ-ACC-STK-02,FOC251001A2,TAG-3002,10.20.10.2,ACTIVE,Cisco,C9200L-48T-4X-E,1,HQ-CAMPUS,MDF-01,39,HQ-ACC-STACK,MEMBER,2
HQ-ACC-STK-03,FOC251001A3,TAG-3003,10.20.10.3,ACTIVE,Cisco,C9200L-48T-4X-E,1,HQ-CAMPUS,MDF-01,38,HQ-ACC-STACK,MEMBER,3
HQ-ACC-STK-04,FOC251001A4,TAG-3004,10.20.10.4,ACTIVE,Cisco,C9200L-48T-4X-E,1,HQ-CAMPUS,MDF-01,37,HQ-ACC-STACK,MEMBER,4
SPARE-SW-9300-01,FOC259900X1,TAG-9001,,MAINTENANCE,Cisco,Catalyst 9300-48P,1,,,,,,
SPARE-RTR-MX204-01,JN12894101A,TAG-9002,,PLANNED,Juniper,MX204,1,,,,,,
`
