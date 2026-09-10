'use server'
import { linkInventorySource, unlinkInventorySource, type LinkInput } from './mutation'
export async function linkSource(input: LinkInput) {
  try {
    return { success: true as const, data: await linkInventorySource(input) }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unable to link source',
    }
  }
}
export async function linkSources(inputs: LinkInput[]) {
  if (inputs.length > 50) throw new Error('Select at most 50 devices per batch.')
  const results = []
  for (const input of inputs)
    results.push({ sourceId: input.sourceId, ...(await linkSource(input)) })
  return results
}
export async function unlinkSource(id: string) {
  try {
    await unlinkInventorySource(id)
    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unable to unlink',
    }
  }
}
