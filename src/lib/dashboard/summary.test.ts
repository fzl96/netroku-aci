import { describe, expect, test } from 'bun:test'
import {
  buildAttentionItems,
  classifyPosture,
  formatRelativeFreshness,
  summarizeInterfaces,
} from './summary'

describe('classifyPosture', () => {
  test('returns critical when failed hardware exists', () => {
    expect(classifyPosture({ failedHardware: 1, offlineNodes: 0, noisyInterfaces: 0 }).tone).toBe(
      'critical',
    )
  })

  test('returns warning for noisy interfaces without critical blockers', () => {
    expect(classifyPosture({ failedHardware: 0, offlineNodes: 0, noisyInterfaces: 2 }).tone).toBe(
      'warning',
    )
  })

  test('returns healthy when no risk signals are present', () => {
    expect(classifyPosture({ failedHardware: 0, offlineNodes: 0, noisyInterfaces: 0 }).tone).toBe(
      'healthy',
    )
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

    expect(items.map((item) => item.key)).toEqual([
      'failed-hardware',
      'offline-nodes',
      'interface-errors',
    ])
  })
})

describe('formatRelativeFreshness', () => {
  test('formats timestamps while handling missing values', () => {
    const now = new Date('2026-06-15T12:00:00Z')
    expect(formatRelativeFreshness(null, now)).toBe('Never synced')
    expect(formatRelativeFreshness('2026-06-15T11:45:00Z', now)).toBe('15m ago')
    expect(formatRelativeFreshness('2026-06-15T03:00:00Z', now)).toBe('9h ago')
  })
})

describe('summarizeInterfaces', () => {
  test('counts interface state and only treats the newest sample as noisy', () => {
    expect(
      summarizeInterfaces(
        [
          { adminSt: 'up', operSt: 'up', count: 2 },
          { adminSt: 'up', operSt: 'down', count: 1 },
          { adminSt: 'down', operSt: 'down', count: 1 },
        ],
        [
          {
            interfaceId: 'eth1',
            sampledAt: '2026-06-15T12:00:00Z',
            dRxErrors: 0,
            dTxErrors: 0,
            dRxDiscards: 0,
            dTxDiscards: 0,
            dRxCrcErrors: 0,
            dRxAlignErrors: 0,
          },
          {
            interfaceId: 'eth1',
            sampledAt: '2026-06-15T11:00:00Z',
            dRxErrors: 5,
            dTxErrors: 0,
            dRxDiscards: 0,
            dTxDiscards: 0,
            dRxCrcErrors: 0,
            dRxAlignErrors: 0,
          },
          {
            interfaceId: 'eth2',
            sampledAt: '2026-06-15T12:00:00Z',
            dRxErrors: 0,
            dTxErrors: 0,
            dRxDiscards: 1,
            dTxDiscards: 0,
            dRxCrcErrors: 0,
            dRxAlignErrors: 0,
          },
        ],
      ),
    ).toEqual({ total: 4, adminDown: 1, operDown: 1, noisy: 1 })
  })
})
