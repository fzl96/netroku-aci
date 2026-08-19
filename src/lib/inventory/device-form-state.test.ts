import { describe, expect, it } from 'bun:test'
import { resolveStackSelectValue } from './device-form-state'

describe('resolveStackSelectValue', () => {
  const stacks = [{ name: 'known' }]

  it('distinguishes no stack, new-stack mode, and an existing stack', () => {
    expect(resolveStackSelectValue(null, stacks)).toBe('__none__')
    expect(resolveStackSelectValue(undefined, stacks)).toBe('__none__')
    expect(resolveStackSelectValue('', stacks)).toBe('__new__')
    expect(resolveStackSelectValue('known', stacks)).toBe('known')
    expect(resolveStackSelectValue('new-name', stacks)).toBe('__new__')
  })
})
