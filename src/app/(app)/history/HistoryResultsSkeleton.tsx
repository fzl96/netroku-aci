import { Skeleton } from '@/components/ui/skeleton'
import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'

const HEADERS = ['When', 'User', 'Action', 'Target', 'Status', 'Detail']

export function HistoryResultsSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading history"
      role="status"
    >
      <div className="flex justify-end">
        <Skeleton className="h-3 w-20" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className={TABLE_SCROLL_CLS}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                {HEADERS.map(header => (
                  <th key={header} className={DENSE_TABLE_HEAD_CLS}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border-faint">
                  {HEADERS.map((header, columnIndex) => (
                    <td key={header} className="px-4 py-3">
                      <Skeleton
                        className={[
                          'h-3',
                          columnIndex === 0 ? 'w-28' : '',
                          columnIndex === 1 ? 'w-24' : '',
                          columnIndex === 2 ? 'w-28' : '',
                          columnIndex === 3 ? 'w-36' : '',
                          columnIndex === 4 ? 'w-16' : '',
                          columnIndex === 5 ? 'w-40' : '',
                        ].join(' ')}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-16" />
        </div>
      </div>
    </div>
  )
}
