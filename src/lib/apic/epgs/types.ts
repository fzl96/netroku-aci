import type { CsvValidationError, RowStatus } from '../types'

export type EpgContractRole = 'consumer' | 'provider'

export interface EpgRow {
  tenant: string
  anp: string
  epg: string
  bd: string
  bd_tenant?: string
  contract_tenant?: string
  phys_domain?: string
  consContracts: string[]
  provContracts: string[]
  epg_desc?: string
}

export interface EpgContractRow extends Omit<EpgRow, 'consContracts' | 'provContracts'> {
  contract: string
  consContracts?: string[]
  provContracts?: string[]
}

export interface ParsedEpgRow extends EpgRow {
  rowIndex: number
}

export interface ParsedEpgContractRow extends EpgContractRow {
  rowIndex: number
}

export type ParsedAnyEpgRow = ParsedEpgRow | ParsedEpgContractRow

export function effectiveBridgeDomainTenant(row: Pick<EpgRow, 'tenant' | 'bd_tenant'>): string {
  return row.bd_tenant?.trim() || row.tenant
}

export function effectiveContractTenant(row: Pick<EpgRow, 'tenant' | 'contract_tenant'>): string {
  return row.contract_tenant?.trim() || row.tenant
}

export interface EpgValidationResult {
  rowIndex: number
  status: RowStatus
  message?: string
}

export interface EpgDeployResult {
  rowIndex: number
  success: boolean
  message?: string
}

export type { CsvValidationError }
