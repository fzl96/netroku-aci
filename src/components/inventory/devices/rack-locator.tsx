import { cn } from '@/lib/utils'

const UNIT_ROW_PX = 3

export function unitRange(position: number, heightU: number): string {
  const top = position + Math.max(1, heightU) - 1
  return top > position ? `U${position}–U${top}` : `U${position}`
}

/** A to-scale sliver of the rack, top unit first, with the device's units
 *  filled in — where it sits reads at a glance before any number does. */
export function RackLocator({
  rackHeight,
  position,
  deviceHeight,
}: {
  rackHeight: number
  position: number
  deviceHeight: number
}) {
  const top = Math.min(position + Math.max(1, deviceHeight) - 1, rackHeight)
  const span = top - position + 1
  const rows = { gridTemplateRows: `repeat(${rackHeight}, ${UNIT_ROW_PX}px)` }
  const label = unitRange(position, deviceHeight)

  return (
    <div
      role="img"
      aria-label={`Occupies ${label} of a ${rackHeight}U rack`}
      className="flex shrink-0 flex-col gap-1.5"
    >
      <span className="font-mono text-[10px] leading-none text-faint">U{rackHeight}</span>
      <div className="flex gap-2">
        <div
          className="grid w-9 gap-y-px rounded-[4px] border border-border bg-background p-[3px]"
          style={rows}
        >
          {Array.from({ length: rackHeight }, (_, index) => {
            const unit = rackHeight - index
            return (
              <div
                key={unit}
                className={cn(
                  'rounded-[1px]',
                  unit >= position && unit <= top ? 'bg-primary' : 'bg-border',
                )}
              />
            )
          })}
        </div>
        {span > 0 && (
          <div className="grid gap-y-px py-[4px]" style={rows}>
            <span
              className="self-center font-mono text-[10px] leading-none whitespace-nowrap text-primary"
              style={{ gridRow: `${rackHeight - top + 1} / span ${span}` }}
            >
              {label}
            </span>
          </div>
        )}
      </div>
      <span className="font-mono text-[10px] leading-none text-faint">U1</span>
    </div>
  )
}
