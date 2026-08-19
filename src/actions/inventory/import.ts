'use server'

import { DeviceStatus, StackRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import type { ParsedImportRow, MalformedImportRow } from '@/lib/inventory/csv'
import { requiredRackHeight } from '@/lib/inventory/import-planning'
import { ensureStackHasMaster } from '@/lib/inventory/stack-master'

export type ImportRowState = {
  row: ParsedImportRow
  action: 'CREATE' | 'UPDATE'
  targetDeviceId?: string
  siteStatus?: 'EXISTS' | 'WILL_CREATE'
  rackStatus?: 'EXISTS' | 'WILL_CREATE'
  errors: string[]
  warnings: string[]
}

export type ImportSummary = {
  totalRows: number
  validCount: number
  createCount: number
  updateCount: number
  sitesToCreate: string[]
  racksToCreate: Array<{ siteName: string; rackName: string; heightU: number }>
  errorCount: number
  canImport: boolean
}

export type ValidationResultData = {
  summary: ImportSummary
  rowStates: ImportRowState[]
  canImport: boolean
}

export type ImportExecutionResult = {
  createdCount: number
  updatedCount: number
  sitesCreated: number
  racksCreated: number
  skippedErrorsCount: number
}

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireAdmin() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (session.user.role !== 'admin') throw new Error('Forbidden')
  return {
    id: session.user.id,
    userName: session.user.username ?? session.user.name,
  }
}

export async function validateDeviceImport(
  rows: ParsedImportRow[],
  malformedRows: MalformedImportRow[] = [],
): Promise<ActionResult<ValidationResultData>> {
  try {
    await requireAdmin()

    // 1. Fetch DB entities for cross-referencing
    const [existingSites, existingRacks, existingDevices, existingStacks] = await Promise.all([
      prisma.site.findMany({ select: { id: true, name: true } }),
      prisma.rack.findMany({
        select: {
          id: true,
          name: true,
          heightU: true,
          siteId: true,
          site: { select: { id: true, name: true } },
          devices: {
            select: {
              id: true,
              name: true,
              serialNumber: true,
              rackPosition: true,
              heightU: true,
            },
          },
        },
      }),
      prisma.device.findMany({
        select: {
          id: true,
          name: true,
          serialNumber: true,
          assetTag: true,
          managementIp: true,
          rackId: true,
          rackPosition: true,
          heightU: true,
          deviceStackId: true,
          stackMember: true,
          stackRole: true,
        },
      }),
      prisma.deviceStack.findMany({
        select: {
          id: true,
          name: true,
          devices: {
            select: {
              id: true,
              name: true,
              serialNumber: true,
              stackMember: true,
              stackRole: true,
            },
          },
        },
      }),
    ])

    // Lookup maps
    const deviceBySerial = new Map(existingDevices.map((d) => [d.serialNumber.toLowerCase(), d]))
    const deviceByAssetTag = new Map(
      existingDevices.filter((d) => d.assetTag).map((d) => [d.assetTag!.toLowerCase(), d]),
    )
    const deviceByManagementIp = new Map(
      existingDevices.filter((d) => d.managementIp).map((d) => [d.managementIp!.toLowerCase(), d]),
    )
    const siteByName = new Map(existingSites.map((s) => [s.name.toLowerCase(), s]))
    const rackBySiteAndName = new Map(
      existingRacks.map((r) => [`${r.site.name.toLowerCase()}::${r.name.toLowerCase()}`, r]),
    )
    const stackByName = new Map(existingStacks.map((s) => [s.name.toLowerCase(), s]))

    const sitesToCreateSet = new Set<string>()
    const racksToCreateMap = new Map<
      string,
      { siteName: string; rackName: string; heightU: number }
    >()

    const rowStates: ImportRowState[] = []
    let errorCount = 0
    let createCount = 0
    let updateCount = 0

    // Intra-file tracking maps
    const seenSerials = new Map<string, number>()
    const seenTags = new Map<string, number>()
    const seenIps = new Map<string, { rowIndex: number; hostname: string; stackName: string | null }>()
    const stackSwitches = new Map<string, Map<number, number>>()
    type PlacedUnit = { rowIndex: number; hostname: string; heightU: number; topU: number; bottomU: number }
    const rackPlacements = new Map<string, PlacedUnit[]>()

    for (const row of rows) {
      const rowErrors: string[] = []
      const rowWarnings: string[] = []

      // 1. Check intra-file serial duplicates
      const serialKey = row.serialNumber.toLowerCase()
      const firstSerialRow = seenSerials.get(serialKey)
      if (firstSerialRow !== undefined) {
        rowErrors.push(`Duplicate serial number "${row.serialNumber}" within file (already defined at row ${firstSerialRow})`)
      } else {
        seenSerials.set(serialKey, row.rowIndex)
      }

      // 2. Check intra-file asset tag duplicates
      if (row.assetTag) {
        const tagKey = row.assetTag.toLowerCase()
        const firstTagRow = seenTags.get(tagKey)
        if (firstTagRow !== undefined) {
          rowErrors.push(`Duplicate asset tag "${row.assetTag}" within file (already defined at row ${firstTagRow})`)
        } else {
          seenTags.set(tagKey, row.rowIndex)
        }
      }

      // 3. Check intra-file management IP duplicates (switches in the same stack may share the stack IP)
      if (row.managementIp) {
        const ipKey = row.managementIp.toLowerCase()
        const firstIp = seenIps.get(ipKey)
        if (firstIp !== undefined) {
          const isSameStack = Boolean(
            row.stackName &&
              firstIp.stackName &&
              row.stackName.toLowerCase() === firstIp.stackName.toLowerCase(),
          )
          if (!isSameStack) {
            rowErrors.push(
              `Duplicate management IP "${row.managementIp}" within file (already used by row ${firstIp.rowIndex} "${firstIp.hostname}")`,
            )
          }
        } else {
          seenIps.set(ipKey, {
            rowIndex: row.rowIndex,
            hostname: row.hostname,
            stackName: row.stackName,
          })
        }
      }

      // Check if serial matches existing device -> UPDATE, otherwise CREATE
      const existingDev = deviceBySerial.get(row.serialNumber.toLowerCase())
      const action: 'CREATE' | 'UPDATE' = existingDev ? 'UPDATE' : 'CREATE'
      if (action === 'CREATE') {
        createCount++
      } else {
        updateCount++
        rowWarnings.push(`Existing device "${existingDev!.name}" will be updated`)
      }

      // Check asset tag collision against other devices in DB
      if (row.assetTag) {
        const tagOwner = deviceByAssetTag.get(row.assetTag.toLowerCase())
        if (tagOwner && tagOwner.serialNumber.toLowerCase() !== row.serialNumber.toLowerCase()) {
          rowErrors.push(`Asset tag "${row.assetTag}" is already used by "${tagOwner.name}" (${tagOwner.serialNumber})`)
        }
      }

      // Check management IP collision against other devices in DB (allowing same stack)
      if (row.managementIp) {
        const ipOwner = deviceByManagementIp.get(row.managementIp.toLowerCase())
        if (ipOwner && ipOwner.serialNumber.toLowerCase() !== row.serialNumber.toLowerCase()) {
          const isSameDbStack = Boolean(
            row.stackName &&
              ipOwner.deviceStackId &&
              stackByName.get(row.stackName.toLowerCase())?.id === ipOwner.deviceStackId,
          )
          if (!isSameDbStack) {
            rowErrors.push(
              `Management IP "${row.managementIp}" is already assigned to "${ipOwner.name}" (${ipOwner.serialNumber})`,
            )
          }
        }
      }

      // 4. Check intra-file rack placement collisions
      if (row.rack && row.rackPosition !== null) {
        const rackKey = `${(row.site ?? '').toLowerCase()}::${row.rack.toLowerCase()}`
        const bottomU = row.rackPosition
        const topU = row.rackPosition + row.heightU - 1
        const list = rackPlacements.get(rackKey) ?? []
        for (const placed of list) {
          if (bottomU <= placed.topU && topU >= placed.bottomU) {
            rowErrors.push(
              `Rack slot conflict with row ${placed.rowIndex} ("${placed.hostname}") at U${bottomU}${row.heightU > 1 ? `–U${topU}` : ''}`,
            )
          }
        }
        list.push({ rowIndex: row.rowIndex, hostname: row.hostname, heightU: row.heightU, topU, bottomU })
        rackPlacements.set(rackKey, list)
      }

      // 5. Check intra-file stack switch ID duplicates
      if (row.stackName && row.switchId !== null) {
        const stackKey = row.stackName.toLowerCase()
        const switchMap = stackSwitches.get(stackKey) ?? new Map<number, number>()
        const firstSwRow = switchMap.get(row.switchId)
        if (firstSwRow !== undefined) {
          rowErrors.push(
            `Duplicate switch #${row.switchId} in stack "${row.stackName}" within file (already used by row ${firstSwRow})`,
          )
        } else {
          switchMap.set(row.switchId, row.rowIndex)
          stackSwitches.set(stackKey, switchMap)
        }
      }

      // Check site & rack resolution
      let siteStatus: 'EXISTS' | 'WILL_CREATE' | undefined = undefined
      let rackStatus: 'EXISTS' | 'WILL_CREATE' | undefined = undefined

      if (row.site) {
        const siteMatch = siteByName.get(row.site.toLowerCase())
        if (siteMatch) {
          siteStatus = 'EXISTS'
        } else {
          siteStatus = 'WILL_CREATE'
          sitesToCreateSet.add(row.site)
        }
      }

      if (row.rack) {
        // Must have site to resolve rack or default site name
        const siteKey = (row.site ?? '').toLowerCase()
        const rackKey = `${siteKey}::${row.rack.toLowerCase()}`
        const rackMatch = rackBySiteAndName.get(rackKey)

        if (rackMatch) {
          rackStatus = 'EXISTS'

          // Check rack collision against DB devices (ignoring the device itself if update)
          if (row.rackPosition !== null) {
            const bottomU = row.rackPosition
            const topU = row.rackPosition + row.heightU - 1

            if (topU > rackMatch.heightU) {
              rowErrors.push(`Position U${topU} exceeds rack "${rackMatch.name}" height (${rackMatch.heightU}U)`)
            }

            for (const d of rackMatch.devices) {
              if (d.rackPosition !== null) {
                // Ignore self if updating existing device
                if (existingDev && d.serialNumber.toLowerCase() === row.serialNumber.toLowerCase()) {
                  continue
                }
                const dBottomU = d.rackPosition
                const dTopU = d.rackPosition + d.heightU - 1
                if (bottomU <= dTopU && topU >= dBottomU) {
                  rowErrors.push(
                    `Rack collision at U${bottomU}${row.heightU > 1 ? `–U${topU}` : ''} with existing "${d.name}" (${d.serialNumber})`,
                  )
                }
              }
            }
          }
        } else {
          rackStatus = 'WILL_CREATE'
          const effectiveSiteName = row.site ?? 'Default'
          if (!row.site) sitesToCreateSet.add(effectiveSiteName)

          try {
            const existingPending = racksToCreateMap.get(rackKey)
            const heightU = Math.max(
              existingPending?.heightU ?? 42,
              requiredRackHeight(row.rackPosition, row.heightU),
            )
            racksToCreateMap.set(rackKey, {
              siteName: effectiveSiteName,
              rackName: row.rack,
              heightU,
            })
          } catch (error) {
            rowErrors.push(error instanceof Error ? error.message : 'Invalid rack placement')
          }
        }
      }

      // Check stack member collision against existing DB devices in stack
      if (row.stackName && row.switchId !== null) {
        const stackMatch = stackByName.get(row.stackName.toLowerCase())
        if (stackMatch) {
          const conflict = stackMatch.devices.find(
            (d) =>
              d.stackMember === row.switchId &&
              d.serialNumber.toLowerCase() !== row.serialNumber.toLowerCase(),
          )
          if (conflict) {
            rowErrors.push(
              `Switch #${row.switchId} is already used by "${conflict.name}" (${conflict.serialNumber}) in stack "${row.stackName}"`,
            )
          }
        }
      }

      if (rowErrors.length > 0) errorCount++

      rowStates.push({
        row,
        action,
        targetDeviceId: existingDev?.id,
        siteStatus,
        rackStatus,
        errors: rowErrors,
        warnings: rowWarnings,
      })
    }

    // Also include any syntax/client-malformed rows so they appear in the review table
    for (const m of malformedRows) {
      errorCount++
      rowStates.push({
        row: {
          rowIndex: m.rowIndex,
          hostname: m.hostname,
          serialNumber: m.serialNumber,
          assetTag: m.assetTag,
          managementIp: m.managementIp,
          status: DeviceStatus.ACTIVE,
          vendor: m.vendor,
          model: m.model,
          heightU: m.heightU,
          site: m.site,
          rack: m.rack,
          rackPosition: m.rackPosition,
          stackName: m.stackName,
          stackRole: null,
          switchId: null,
        },
        action: 'CREATE',
        errors: m.errors,
        warnings: [],
      })
    }

    rowStates.sort((a, b) => a.row.rowIndex - b.row.rowIndex)

    const totalRows = rows.length + malformedRows.length
    const validCount = rows.length - (errorCount - malformedRows.length)
    const summary: ImportSummary = {
      totalRows,
      validCount,
      createCount,
      updateCount,
      sitesToCreate: Array.from(sitesToCreateSet),
      racksToCreate: Array.from(racksToCreateMap.values()).map((r) => ({
        siteName: r.siteName,
        rackName: r.rackName,
        heightU: r.heightU,
      })),
      errorCount,
      canImport: validCount > 0,
    }

    return {
      success: true,
      data: {
        summary,
        rowStates,
        canImport: summary.canImport,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation failed' }
  }
}

export async function executeDeviceImport(
  rows: ParsedImportRow[],
): Promise<ActionResult<ImportExecutionResult>> {
  try {
    const actor = await requireAdmin()

    // 1. Run validation
    const validation = await validateDeviceImport(rows)
    if (!validation.success) return validation
    if (!validation.data.canImport) {
      return { success: false, error: 'No valid devices to import' }
    }

    // Filter to only valid rows
    const validRowStates = validation.data.rowStates.filter((rs) => rs.errors.length === 0)
    const validRows = validRowStates.map((rs) => rs.row)
    const skippedErrorsCount = rows.length - validRows.length

    if (validRows.length === 0) {
      return { success: false, error: 'No valid devices to import' }
    }

    // Determine sites and racks to create from valid rows only
    const validSitesToCreate = new Set<string>()
    const validRacksToCreate = new Map<
      string,
      { siteName: string; rackName: string; heightU: number }
    >()

    for (const rs of validRowStates) {
      if (rs.siteStatus === 'WILL_CREATE' && rs.row.site) {
        validSitesToCreate.add(rs.row.site)
      }
      if (rs.rackStatus === 'WILL_CREATE' && rs.row.rack) {
        const siteName = rs.row.site ?? 'Default'
        if (!rs.row.site) validSitesToCreate.add(siteName)
        const key = `${siteName.toLowerCase()}::${rs.row.rack.toLowerCase()}`
        const existing = validRacksToCreate.get(key)
        validRacksToCreate.set(key, {
          siteName,
          rackName: rs.row.rack,
          heightU: Math.max(
            existing?.heightU ?? 42,
            requiredRackHeight(rs.row.rackPosition, rs.row.heightU),
          ),
        })
      }
    }

    // 2. Perform transaction
    const result = await prisma.$transaction(async (tx) => {
      const siteMap = new Map<string, string>()
      const rackMap = new Map<string, string>()
      const stackMap = new Map<string, string>()

      let sitesCreated = 0
      let racksCreated = 0

      // Pre-load all existing sites and racks
      const [existingSites, existingRacks, existingStacks] = await Promise.all([
        tx.site.findMany({ select: { id: true, name: true } }),
        tx.rack.findMany({
          select: {
            id: true,
            name: true,
            site: { select: { name: true } },
          },
        }),
        tx.deviceStack.findMany({ select: { id: true, name: true } }),
      ])

      for (const s of existingSites) siteMap.set(s.name.toLowerCase(), s.id)
      for (const r of existingRacks) rackMap.set(`${r.site.name.toLowerCase()}::${r.name.toLowerCase()}`, r.id)
      for (const st of existingStacks) stackMap.set(st.name.toLowerCase(), st.id)

      // Step A: Create any missing sites for valid rows
      for (const siteName of validSitesToCreate) {
        const key = siteName.toLowerCase()
        if (!siteMap.has(key)) {
          const newSite = await tx.site.create({ data: { name: siteName } })
          siteMap.set(key, newSite.id)
          sitesCreated++
        }
      }

      // Step B: Create any missing racks for valid rows
      for (const r of validRacksToCreate.values()) {
        const siteKey = r.siteName.toLowerCase()
        const siteId = siteMap.get(siteKey)
        if (!siteId) throw new Error(`Site "${r.siteName}" could not be resolved`)

        const rackKey = `${siteKey}::${r.rackName.toLowerCase()}`
        if (!rackMap.has(rackKey)) {
          const newRack = await tx.rack.create({
            data: {
              name: r.rackName,
              heightU: r.heightU,
              siteId,
            },
          })
          rackMap.set(rackKey, newRack.id)
          racksCreated++
        }
      }

      // Step C: Create any missing stacks for valid rows
      for (const row of validRows) {
        if (row.stackName) {
          const stackKey = row.stackName.toLowerCase()
          if (!stackMap.has(stackKey)) {
            const newStack = await tx.deviceStack.create({
              data: { name: row.stackName },
            })
            stackMap.set(stackKey, newStack.id)
          }
        }
      }

      let createdCount = 0
      let updatedCount = 0
      const affectedStackIds = new Set<string>()
      const explicitlyDemotedByStack = new Map<string, string>()

      // Step D: Process valid rows (Upsert devices)
      for (const row of validRows) {
        let rackId: string | null = null
        if (row.rack) {
          const siteKey = (row.site ?? 'Default').toLowerCase()
          const rackKey = `${siteKey}::${row.rack.toLowerCase()}`
          rackId = rackMap.get(rackKey) ?? null
        }

        let deviceStackId: string | null = null
        if (row.stackName) {
          deviceStackId = stackMap.get(row.stackName.toLowerCase()) ?? null
        }

        // If assigning role MASTER, demote other masters in the stack
        if (deviceStackId && row.stackRole === StackRole.MASTER) {
          await tx.device.updateMany({
            where: {
              deviceStackId,
              stackRole: StackRole.MASTER,
              serialNumber: { not: row.serialNumber },
            },
            data: { stackRole: StackRole.MEMBER },
          })
        }

        const existing = await tx.device.findUnique({
          where: { serialNumber: row.serialNumber },
          select: { id: true, deviceStackId: true, stackRole: true },
        })

        if (existing) {
          const prevStackId = existing.deviceStackId

          await tx.device.update({
            where: { serialNumber: row.serialNumber },
            data: {
              name: row.hostname,
              assetTag: row.assetTag,
              managementIp: row.managementIp,
              status: row.status,
              vendor: row.vendor,
              model: row.model,
              heightU: row.heightU,
              rackId,
              rackPosition: row.rackPosition,
              deviceStackId,
              stackRole: row.stackRole,
              stackMember: row.switchId,
            },
          })
          updatedCount++

          if (prevStackId) affectedStackIds.add(prevStackId)
          if (deviceStackId) affectedStackIds.add(deviceStackId)
          if (
            prevStackId &&
            prevStackId === deviceStackId &&
            existing.stackRole === StackRole.MASTER &&
            row.stackRole !== StackRole.MASTER
          ) {
            explicitlyDemotedByStack.set(prevStackId, existing.id)
          }

          // Cleanup orphan stack
          if (prevStackId && prevStackId !== deviceStackId) {
            const count = await tx.device.count({ where: { deviceStackId: prevStackId } })
            if (count === 0) await tx.deviceStack.delete({ where: { id: prevStackId } })
          }
        } else {
          await tx.device.create({
            data: {
              name: row.hostname,
              serialNumber: row.serialNumber,
              assetTag: row.assetTag,
              managementIp: row.managementIp,
              status: row.status,
              vendor: row.vendor,
              model: row.model,
              heightU: row.heightU,
              rackId,
              rackPosition: row.rackPosition,
              deviceStackId,
              stackRole: row.stackRole,
              stackMember: row.switchId,
            },
          })
          createdCount++
          if (deviceStackId) affectedStackIds.add(deviceStackId)
        }
      }

      for (const stackId of affectedStackIds) {
        await ensureStackHasMaster(tx, stackId, explicitlyDemotedByStack.get(stackId))
      }

      return {
        createdCount,
        updatedCount,
        sitesCreated,
        racksCreated,
        skippedErrorsCount,
      }
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.import',
      target: `Imported ${validRows.length} valid devices (${result.createdCount} created, ${result.updatedCount} updated, ${result.skippedErrorsCount} skipped errors)`,
    })

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Import execution failed' }
  }
}
