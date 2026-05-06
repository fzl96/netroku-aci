export type PortType = 'vpc' | 'pc' | 'port'
export type Mode = 'regular' | 'native' | 'untagged'
export type Immediacy = 'immediate' | 'lazy'
export type RowStatus = 'deploy' | 'rollback' | 'exists' | 'missing' | 'error'

export interface CsvRow {
  tenant: string
  ap: string
  epg: string
  vlan: number          // 1–4094
  node1: number
  node2: number | null  // null for pc/port, required for vpc
  port_type: PortType
  interface_or_ipg: string
  mode: Mode
  immediacy: Immediacy
}

export interface ParsedRow extends CsvRow {
  rowIndex: number  // 1-based row number for error messages
}

export interface ValidationResult {
  rowIndex: number
  status: RowStatus
  message?: string  // populated when status === 'error'
}

export interface DeployResult {
  rowIndex: number
  success: boolean
  message?: string  // APIC error message on failure
}

export interface CsvValidationError {
  rowIndex: number
  field: string
  message: string
}
