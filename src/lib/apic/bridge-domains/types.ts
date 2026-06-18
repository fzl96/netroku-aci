import type { CsvValidationError, RowStatus } from '../types'

export type BridgeDomainMode = 'l2' | 'l3'

export interface BridgeDomainL2Row {
  tenant: string
  bd: string
  vrf: string
  bd_desc?: string
}

export interface BridgeDomainL3Row extends BridgeDomainL2Row {
  subnet: string
  l3out: string
}

export interface ParsedBridgeDomainL2Row extends BridgeDomainL2Row {
  rowIndex: number
}

export interface ParsedBridgeDomainL3Row extends BridgeDomainL3Row {
  rowIndex: number
}

export type ParsedBridgeDomainRow =
  | ParsedBridgeDomainL2Row
  | ParsedBridgeDomainL3Row

export interface BridgeDomainValidationResult {
  rowIndex: number
  status: RowStatus
  message?: string
}

export interface BridgeDomainDeployResult {
  rowIndex: number
  success: boolean
  message?: string
}

export type { CsvValidationError }
