export type CounterMode = 'delta' | 'current'

export interface CounterFields {
  rxBytes: string | null
  rxErrors: string | null
  rxCrcErrors: string | null
  rxAlignErrors: string | null
  txBytes: string | null
  txErrors: string | null
  dRxBytes: string | null
  dRxErrors: string | null
  dRxCrcErrors: string | null
  dRxAlignErrors: string | null
  dTxBytes: string | null
  dTxErrors: string | null
}

export interface VisibleCounters {
  rxBytes: string | null
  rxErrors: string | null
  rxCrcErrors: string | null
  rxAlignErrors: string | null
  txBytes: string | null
  txErrors: string | null
}

export function selectVisibleCounters(
  row: CounterFields,
  mode: CounterMode,
): VisibleCounters {
  if (mode === 'current') {
    return {
      rxBytes: row.rxBytes,
      rxErrors: row.rxErrors,
      rxCrcErrors: row.rxCrcErrors,
      rxAlignErrors: row.rxAlignErrors,
      txBytes: row.txBytes,
      txErrors: row.txErrors,
    }
  }

  return {
    rxBytes: row.dRxBytes,
    rxErrors: row.dRxErrors,
    rxCrcErrors: row.dRxCrcErrors,
    rxAlignErrors: row.dRxAlignErrors,
    txBytes: row.dTxBytes,
    txErrors: row.dTxErrors,
  }
}
