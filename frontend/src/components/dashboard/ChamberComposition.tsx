import { useState } from 'react'
import type { CSSProperties } from 'react'
import { PARTY_LABELS } from '../../lib/constants'
import type { ChamberCounts, PartyCounts } from '../../lib/stats'

export type ChamberView = 'both' | 'house' | 'senate'

const VIEWS: { value: ChamberView; label: string }[] = [
  { value: 'both', label: 'Both chambers' },
  { value: 'house', label: 'House' },
  { value: 'senate', label: 'Senate' },
]

interface Dot {
  party: 'd' | 'i' | 'r'
  key: number
}

// One circle per member, Democrats first, Independents in the middle and
// Republicans last. The grid flows column by column, so that sequence reads
// left to right across the chamber: Democrats (left-leaning) in the left
// columns, Independents at the interface, Republicans (right-leaning) in
// the right columns — no party stacked above another. The circles are
// colored with the same party tokens as the member directory cards on the
// Members page.
function dotsFor(counts: PartyCounts): Dot[] {
  const dots: Dot[] = []
  for (let n = 0; n < counts.D; n += 1) dots.push({ party: 'd', key: n })
  for (let n = 0; n < counts.I; n += 1) dots.push({ party: 'i', key: n })
  for (let n = 0; n < counts.R; n += 1) dots.push({ party: 'r', key: n })
  return dots
}

// Roughly square grid: rows and columns track the square root of the
// membership, so the grid visibly shrinks from both chambers to a single
// chamber. rows × cols may hold more cells than there are members; the
// shortfall is split between the two end columns so the outline stays even:
// the first column misses ceil(shortfall / 2) circles at its top and the
// last column misses the rest at its bottom.
interface GridLayout {
  rows: number
  cols: number
  firstShort: number
  lastShort: number
}

function gridLayout(total: number): GridLayout {
  const rows = Math.max(1, Math.ceil(Math.sqrt(total)))
  const cols = Math.max(1, Math.ceil(total / rows))
  const shortfall = rows * cols - total
  const firstShort = Math.ceil(shortfall / 2)
  return { rows, cols, firstShort, lastShort: shortfall - firstShort }
}

// The explicit cell for the nth dot (0-indexed, in the D, I, R order). The
// first column is bottom-aligned so its missing circles sit at the top, and
// the last column is top-aligned so its missing circles sit at the bottom.
function dotCell(index: number, layout: GridLayout, total: number): { row: number; col: number } {
  const { rows, cols, firstShort, lastShort } = layout
  const firstCount = rows - firstShort
  const lastCount = rows - lastShort
  if (index < firstCount) {
    return { row: firstShort + 1 + index, col: 1 }
  }
  if (index >= total - lastCount) {
    return { row: index - (total - lastCount) + 1, col: cols }
  }
  const middle = index - firstCount
  return { row: (middle % rows) + 1, col: 2 + Math.floor(middle / rows) }
}

interface ChamberCompositionProps {
  counts: ChamberCounts
}

// The party split of the current membership as a grid of one circle per
// member, with a switch between both chambers, the House and the Senate.
export function ChamberComposition({ counts }: ChamberCompositionProps) {
  const [view, setView] = useState<ChamberView>('both')
  const active = counts[view]
  const dots = dotsFor(active)
  const layout = gridLayout(active.total)

  return (
    <div>
      <div className="page-views composition-switch" role="group" aria-label="Chamber view">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`btn btn--sm ${view === option.value ? 'btn--primary' : 'btn--ghost'}`}
            aria-pressed={view === option.value}
            onClick={() => setView(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {active.total > 0 ? (
        <div className="composition-scroll">
          <ul
            className="composition-grid"
            style={{ '--composition-rows': layout.rows, '--composition-cols': layout.cols } as CSSProperties}
            aria-label={`${active.total} members, one circle each: Democrats on the left, Independents in the middle, Republicans on the right`}
          >
            {dots.map((dot, index) => {
              const cell = dotCell(index, layout, dots.length)
              return (
                <li
                  key={`${dot.party}-${dot.key}`}
                  className={`composition-dot composition-dot--${dot.party}`}
                  style={{ gridRowStart: cell.row, gridColumnStart: cell.col } as CSSProperties}
                />
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="muted">No current members on record for that view.</p>
      )}

      <ul className="composition-legend" aria-label="Party counts">
        <li className="composition-legend__item">
          <span className="composition-dot composition-dot--d" aria-hidden="true" />
          {PARTY_LABELS.D} <span className="composition-legend__count">{active.D}</span>
        </li>
        <li className="composition-legend__item">
          <span className="composition-dot composition-dot--i" aria-hidden="true" />
          {PARTY_LABELS.I} <span className="composition-legend__count">{active.I}</span>
        </li>
        <li className="composition-legend__item">
          <span className="composition-dot composition-dot--r" aria-hidden="true" />
          {PARTY_LABELS.R} <span className="composition-legend__count">{active.R}</span>
        </li>
      </ul>

      <p className="composition-total" aria-live="polite">
        <span className="composition-total__count">{active.total}</span> current members
      </p>
    </div>
  )
}
