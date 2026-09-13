import type { CsvValidationError, RowStatus } from '../types'

export type EsgContractRole = 'consumer' | 'provider'

export type EsgSelectorType = 'epg' | 'ip'

export interface EsgRef {
  tenant: string
  anp: string
  esg: string
}

export interface EsgRow extends EsgRef {
  vrf: string
  contract_tenant?: string
  consContracts: string[]
  provContracts: string[]
  esg_desc?: string
}

export interface ParsedEsgRow extends EsgRow {
  rowIndex: number
}

export interface EsgSelectorRow extends EsgRef {
  selector_type: EsgSelectorType
  selector_value: string
  /** Application profile of the selected EPG. Defaults to the ESG's anp. */
  epg_anp?: string
  selector_desc?: string
}

export interface ParsedEsgSelectorRow extends EsgSelectorRow {
  rowIndex: number
}

export function effectiveContractTenant(row: Pick<EsgRow, 'tenant' | 'contract_tenant'>): string {
  return row.contract_tenant?.trim() || row.tenant
}

export function effectiveEpgAnp(row: Pick<EsgSelectorRow, 'anp' | 'epg_anp'>): string {
  return row.epg_anp?.trim() || row.anp
}

export interface EsgValidationResult {
  rowIndex: number
  status: RowStatus
  message?: string
  warning?: string
}

export interface EsgDeployResult {
  rowIndex: number
  success: boolean
  message?: string
}

export type { CsvValidationError }
