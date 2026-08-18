import { describe, expect, it } from 'bun:test'
import { DeviceStatus, StackRole } from '@prisma/client'
import { deviceSchema } from './device'

describe('deviceSchema', () => {
  it('validates a standalone device without stack fields', () => {
    const valid = deviceSchema.safeParse({
      name: 'sw-core-01',
      serialNumber: 'SN123456',
      assetTag: 'TAG-001',
      status: DeviceStatus.ACTIVE,
      vendor: 'Cisco',
      model: 'Nexus 9300',
      heightU: 1,
    })
    expect(valid.success).toBe(true)
  })

  it('validates a stacked device with stack fields', () => {
    const valid = deviceSchema.safeParse({
      name: 'sw-acc-01',
      serialNumber: 'SN654321',
      assetTag: null,
      status: DeviceStatus.ACTIVE,
      vendor: 'Cisco',
      model: 'Catalyst 9300',
      heightU: 1,
      deviceStackName: 'ACC-STACK-01',
      stackRole: StackRole.MASTER,
      stackMember: 1,
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.deviceStackName).toBe('ACC-STACK-01')
      expect(valid.data.stackRole).toBe('MASTER')
      expect(valid.data.stackMember).toBe(1)
    }
  })

  it('rejects invalid member numbers or negative heights', () => {
    const invalidMember = deviceSchema.safeParse({
      name: 'sw-acc-01',
      serialNumber: 'SN654321',
      status: DeviceStatus.ACTIVE,
      vendor: 'Cisco',
      model: 'Catalyst 9300',
      heightU: 1,
      deviceStackName: 'ACC-STACK-01',
      stackRole: StackRole.MEMBER,
      stackMember: -5,
    })
    expect(invalidMember.success).toBe(false)

    const invalidMemberLarge = deviceSchema.safeParse({
      name: 'sw-acc-01',
      serialNumber: 'SN654321',
      status: DeviceStatus.ACTIVE,
      vendor: 'Cisco',
      model: 'Catalyst 9300',
      heightU: 1,
      deviceStackName: 'ACC-STACK-01',
      stackRole: StackRole.MEMBER,
      stackMember: 99,
    })
    expect(invalidMemberLarge.success).toBe(false)
  })
})
