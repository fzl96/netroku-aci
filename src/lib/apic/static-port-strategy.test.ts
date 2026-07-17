import { describe, expect, it } from 'bun:test'
import {
  STATIC_PORT_BULK_THRESHOLD,
  selectStaticPortValidationStrategy,
} from './static-port-strategy'

describe('selectStaticPortValidationStrategy', () => {
  it('uses exact validation through the 100-row threshold', () => {
    expect(STATIC_PORT_BULK_THRESHOLD).toBe(100)
    expect(selectStaticPortValidationStrategy(0)).toBe('exact')
    expect(selectStaticPortValidationStrategy(1)).toBe('exact')
    expect(selectStaticPortValidationStrategy(100)).toBe('exact')
  })

  it('uses snapshot validation above the threshold', () => {
    expect(selectStaticPortValidationStrategy(101)).toBe('snapshot')
    expect(selectStaticPortValidationStrategy(3_680)).toBe('snapshot')
  })
})
