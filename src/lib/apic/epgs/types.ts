import type { CsvValidationError, RowStatus } from '../types'

export type EpgContractRole = 'consumer' | 'provider'

export interface EpgRow {
  tenant: string
  anp: string
  epg: string
  bd: string
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
