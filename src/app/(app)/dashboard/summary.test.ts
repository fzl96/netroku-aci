import { describe, expect, test } from 'bun:test'
import {
  buildAttentionItems,
  classifyPosture,
  formatRelativeFreshness,
  summarizeInterfaces,
} from './summary'

describe('classifyPosture', () => {
  test('returns critical when failed hardware exists', () => {
    expect(classifyPosture({
      failedHardware: 1,
      offlineNodes: 0,
      noisyInterfaces: 0,
    }).tone).toBe('critical')
  })

  test('returns warning for noisy interfaces without critical blockers', () => {
    expect(classifyPosture({
      failedHardware: 0,
      offlineNodes: 0,
      noisyInterfaces: 2,
    }).tone).toBe('warning')
  })

  test('returns healthy when no risk signals are present', () => {
    expect(classifyPosture({
      failedHardware: 0,
      offlineNodes: 0,
      noisyInterfaces: 0,
    }).tone).toBe('healthy')
  })
})

describe('buildAttentionItems', () => {
  test('orders the most severe risks first and omits zero-count items', () => {
    const items = buildAttentionItems({
      failedHardware: 1,
      offlineNodes: 2,
      noisyInterfaces: 4,
      downInterfaces: 0,
    })

    expect(items.map(item => item.key)).toEqual([
      'failed-hardware',
      'offline-nodes',
      'interface-errors',
    ])
  })
})

describe('formatRelativeFreshness', () => {
  test('formats never-synced timestamps neutrally', () => {
    expect(formatRelativeFreshness(null, new Date('2026-06-15T12:00:00Z'))).toBe('Never synced')
  })

  test('formats recent timestamps in minutes', () => {
    expect(formatRelativeFreshness(
      '2026-06-15T11:45:00Z',
      new Date('2026-06-15T12:00:00Z'),
    )).toBe('15m ago')
  })

  test('formats older timestamps in hours', () => {
    expect(formatRelativeFreshness(
      '2026-06-15T03:00:00Z',
      new Date('2026-06-15T12:00:00Z'),
    )).toBe('9h ago')
  })
})

describe('summarizeInterfaces', () => {
  test('counts interface state and only treats the newest sample as noisy', () => {
    const summary = summarizeInterfaces(
      [
        { adminSt: 'up', operSt: 'up', count: 2 },
        { adminSt: 'up', operSt: 'down', count: 1 },
        { adminSt: 'down', operSt: 'down', count: 1 },
      ],
      [
        {
          interfaceId: 'eth1',
          sampledAt: new Date('2026-06-15T12:00:00Z'),
          dRxErrors: BigInt(0),
          dTxErrors: BigInt(0),
          dRxDiscards: BigInt(0),
          dTxDiscards: BigInt(0),
          dRxCrcErrors: BigInt(0),
          dRxAlignErrors: BigInt(0),
        },
        {
          interfaceId: 'eth1',
          sampledAt: new Date('2026-06-15T11:00:00Z'),
          dRxErrors: BigInt(5),
          dTxErrors: BigInt(0),
          dRxDiscards: BigInt(0),
          dTxDiscards: BigInt(0),
          dRxCrcErrors: BigInt(0),
          dRxAlignErrors: BigInt(0),
        },
        {
          interfaceId: 'eth2',
          sampledAt: new Date('2026-06-15T12:00:00Z'),
          dRxErrors: BigInt(0),
          dTxErrors: BigInt(0),
          dRxDiscards: BigInt(1),
          dTxDiscards: BigInt(0),
          dRxCrcErrors: BigInt(0),
          dRxAlignErrors: BigInt(0),
        },
      ],
    )

    expect(summary).toEqual({
      total: 4,
      adminDown: 1,
      operDown: 1,
      noisy: 1,
    })
  })
})
