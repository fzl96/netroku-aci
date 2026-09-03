'use server'

import type { DeviceFormValues, DeviceUpdateFormValues } from '@/lib/schemas/device'
import {
  clearDevicePlacementRecord,
  createDeviceRecord,
  deleteDeviceRecord,
  updateDeviceHeightRecord,
  updateDevicePlacementRecord,
  updateDeviceRecord,
} from './mutation'
import type { SafeDevice, SafeDeviceWithRack } from './query'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export async function createDevice(
  data: DeviceFormValues,
): Promise<ActionResult<SafeDeviceWithRack>> {
  try {
    return { success: true, data: await createDeviceRecord(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDevice(
  id: string,
  data: DeviceUpdateFormValues,
): Promise<ActionResult<SafeDeviceWithRack>> {
  try {
    return { success: true, data: await updateDeviceRecord(id, data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteDevice(id: string): Promise<ActionResult<void>> {
  try {
    await deleteDeviceRecord(id)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDevicePlacement(
  deviceId: string,
  rackId: string,
  rackPosition: number,
): Promise<ActionResult<SafeDevice>> {
  try {
    return {
      success: true,
      data: await updateDevicePlacementRecord(deviceId, rackId, rackPosition),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function clearDevicePlacement(deviceId: string): Promise<ActionResult<SafeDevice>> {
  try {
    return { success: true, data: await clearDevicePlacementRecord(deviceId) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDeviceHeight(
  deviceId: string,
  heightU: number,
): Promise<ActionResult<SafeDevice>> {
  try {
    return { success: true, data: await updateDeviceHeightRecord(deviceId, heightU) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
