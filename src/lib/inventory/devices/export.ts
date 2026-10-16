import * as XLSX from 'xlsx'
import type { SafeDeviceWithRack } from './query'
import { deviceSourceKind } from './source'
import type { DeviceExportRequest } from '@/lib/schemas/device-export'

const STATUS_LABEL = {
  ACTIVE: 'Active',
  PLANNED: 'Planned',
  MAINTENANCE: 'Maintenance',
  RETIRED: 'Retired',
} as const

export function buildDeviceWorkbook(devices: SafeDeviceWithRack[]): XLSX.WorkBook {
  const rows = devices.map((device) => {
    const source = deviceSourceKind(device)
    return {
      Name: device.name,
      Source: source === 'LEGACY' ? 'Legacy' : source === 'UNLINKED' ? 'Unlinked' : 'ACI',
      Serial: device.serialNumber,
      'Asset Tag': device.assetTag ?? '',
      'Management IP': device.managementIp ?? '',
      Status: STATUS_LABEL[device.status],
      Vendor: device.vendor,
      Model: device.model,
      Version: device.version ?? '',
      Site: device.rack?.site.name ?? '',
      Rack: device.rack?.name ?? '',
      'Rack Position': device.rackPosition ?? '',
      'Height (U)': device.heightU,
      Stack: device.deviceStack?.name ?? '',
      'Stack Role':
        device.stackRole === 'MASTER' ? 'Master' : device.stackRole === 'MEMBER' ? 'Member' : '',
      'Stack Member': device.stackMember ?? '',
    }
  })
  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [28, 12, 22, 18, 20, 16, 16, 24, 24, 24, 24, 16, 12, 24, 14, 14].map(
    (wch) => ({ wch }),
  )
  if (worksheet['!ref']) worksheet['!autofilter'] = { ref: worksheet['!ref'] }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Devices')
  return workbook
}

export function serializeDeviceWorkbook(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

export function buildDeviceExportFilename(
  scope: DeviceExportRequest['scope'],
  now = new Date(),
): string {
  return `inventory-devices-${scope}-${now.toISOString().replace(/[:.]/g, '-')}.xlsx`
}
