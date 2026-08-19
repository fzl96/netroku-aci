import { describe, expect, it } from 'bun:test'
import { StackRole } from '@prisma/client'
import {
  ensureStackHasMaster,
  selectMasterCandidate,
  type StackMemberCandidate,
} from './stack-master'

const members = (...values: StackMemberCandidate[]) => values

describe('selectMasterCandidate', () => {
  it('preserves an existing master', () => {
    const candidate = selectMasterCandidate(
      members(
        { id: 'member', name: 'switch-1', stackMember: 1, stackRole: StackRole.MEMBER },
        { id: 'master', name: 'switch-2', stackMember: 2, stackRole: StackRole.MASTER },
      ),
    )

    expect(candidate?.id).toBe('master')
  })

  it('promotes the lowest-numbered remaining member', () => {
    const candidate = selectMasterCandidate(
      members(
        { id: 'switch-3', name: 'switch-3', stackMember: 3, stackRole: StackRole.MEMBER },
        { id: 'switch-1', name: 'switch-1', stackMember: 1, stackRole: StackRole.MEMBER },
        { id: 'switch-2', name: 'switch-2', stackMember: 2, stackRole: StackRole.MEMBER },
      ),
    )

    expect(candidate?.id).toBe('switch-1')
  })

  it('excludes an explicitly demoted master when another member exists', () => {
    const candidate = selectMasterCandidate(
      members(
        { id: 'switch-1', name: 'switch-1', stackMember: 1, stackRole: StackRole.MEMBER },
        { id: 'switch-2', name: 'switch-2', stackMember: 2, stackRole: StackRole.MEMBER },
      ),
      'switch-1',
    )

    expect(candidate?.id).toBe('switch-2')
  })

  it('falls back to the excluded member when it is the only candidate', () => {
    const candidate = selectMasterCandidate(
      members({
        id: 'only-switch',
        name: 'only-switch',
        stackMember: 1,
        stackRole: StackRole.MEMBER,
      }),
      'only-switch',
    )

    expect(candidate?.id).toBe('only-switch')
  })

  it('sorts missing switch numbers last and breaks ties by name then id', () => {
    const candidate = selectMasterCandidate(
      members(
        { id: 'z', name: 'beta', stackMember: null, stackRole: null },
        { id: 'b', name: 'alpha', stackMember: 4, stackRole: null },
        { id: 'a', name: 'alpha', stackMember: 4, stackRole: null },
      ),
    )

    expect(candidate?.id).toBe('a')
  })

  it('breaks ties between missing switch numbers by name then id', () => {
    const candidate = selectMasterCandidate(
      members(
        { id: 'z', name: 'beta', stackMember: null, stackRole: StackRole.MEMBER },
        { id: 'a', name: 'alpha', stackMember: null, stackRole: StackRole.MEMBER },
      ),
    )

    expect(candidate?.id).toBe('a')
  })

  it('chooses one deterministic winner when multiple masters exist', () => {
    const candidate = selectMasterCandidate(
      members(
        { id: 'z', name: 'beta', stackMember: null, stackRole: StackRole.MASTER },
        { id: 'a', name: 'alpha', stackMember: null, stackRole: StackRole.MASTER },
      ),
    )

    expect(candidate?.id).toBe('a')
  })
})

describe('ensureStackHasMaster', () => {
  it('locks the stack and demotes duplicate masters to one deterministic winner', async () => {
    const calls: string[] = []
    const tx = {
      $queryRaw: async () => {
        calls.push('lock')
        return []
      },
      device: {
        findMany: async () => {
          calls.push('find')
          return members(
            { id: 'z', name: 'beta', stackMember: null, stackRole: StackRole.MASTER },
            { id: 'a', name: 'alpha', stackMember: null, stackRole: StackRole.MASTER },
          )
        },
        updateMany: async () => {
          calls.push('demote')
          return { count: 1 }
        },
        update: async () => {
          calls.push('promote')
          throw new Error('The deterministic winner is already a master')
        },
      },
    } as unknown as Parameters<typeof ensureStackHasMaster>[0]

    const candidate = await ensureStackHasMaster(tx, 'stack-1')

    expect(candidate?.id).toBe('a')
    expect(calls).toEqual(['lock', 'find', 'demote'])
  })
})
