'use server'

import { updateCompliancePolicies } from './mutation'

export async function saveCompliancePolicies(input: unknown) {
  try {
    await updateCompliancePolicies(input)
    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unable to save compliance parameters',
    }
  }
}
