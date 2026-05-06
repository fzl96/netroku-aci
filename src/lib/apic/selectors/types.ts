import type { CsvValidationError, RowStatus } from '../types'

export type IpgType = 'port' | 'pc' | 'vpc'

export interface SelectorCsvRow {
  interface_profile: string
  selector_name: string
  port: string         // Cisco notation, e.g. "1/1"
  ipg_name: string
  ipg_type: IpgType
  description?: string
}

export interface ParsedSelectorRow extends SelectorCsvRow {
  rowIndex: number
  card: number
  port_num: number
}

export interface SelectorValidationResult {
  rowIndex: number
  status: RowStatus
  message?: string
}

export interface SelectorDeployResult {
  rowIndex: number
  success: boolean
  message?: string
}

export type { CsvValidationError }
