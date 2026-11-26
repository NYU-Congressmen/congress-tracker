import { useState } from 'react'
import { PARTY_ICON_PATHS } from '../../lib/constants'
import type { ChamberCounts } from '../../lib/stats'

export type ChamberView = 'both' | 'house' | 'senate'

const VIEWS: { value: ChamberView; label: string }[] = [
  { value: 'house', label: 'House' },
  { value: 'senate', label: 'Senate' },
  { value: 'both', label: 'Joint session' },
]

const ROW_COUNTS: Record<ChamberView, number> = { both: 10, house: 9, senate: 4 }
const SEAT_RADII: Record<ChamberView, number> = { both: 0.91, house: 1.01, senate: 1.75 }
const HALF_SWEEP = 132 * Math.PI / 180
const PARTY_AISLE = 0.04

interface SeatGroup {
  color: string
  label: string
  count: number
  icon?: string
}

// Allocate each party a sector and distribute its seats across concentric rows.
function seatPositions(view: ChamberView, total: number, parties: SeatGroup[]) {
  const rows = ROW_COUNTS[view]
  const radii = Array.from({ length: rows }, (_, row) => 23 + 24 * row / (rows - 1))
  const totalRadius = radii.reduce((sum, radius) => sum + radius, 0)
  const seatingAngle = 2 * HALF_SWEEP - PARTY_AISLE * (parties.length - 1)
  let nextStart = -HALF_SWEEP

  return parties.flatMap(({ color, count }) => {
    const start = nextStart
    const sector = seatingAngle * count / total
    nextStart += sector + PARTY_AISLE
    let usedRadius = 0
    let placed = 0
    return radii.flatMap((radius, row) => {
      usedRadius += radius
      const throughRow = Math.round(count * usedRadius / totalRadius)
      const seats = throughRow - placed
      placed = throughRow
      return Array.from({ length: seats }, (_, index) => {
        const angle = start + sector * (index + 0.5) / seats
        return {
          key: `${color}-${row}-${index}`,
          color,
          x: 50 + radius * Math.sin(angle),
          y: 49 - radius * Math.cos(angle),
        }
      })
    })
  })
}

interface ChamberCompositionProps {
  counts: ChamberCounts
}

// Render a party count beside its icon or seat marker.
function PartyLabel({ label, count, color, icon }: SeatGroup) {
  return (
    <li className={`composition-legend__item composition-legend__item--${color}`}>
      {icon ? (
        <span className="composition-legend__icon" aria-hidden="true">
          <span style={{ maskImage: `url(${icon})` }} />
        </span>
      ) : (
        <span className={`composition-dot composition-dot--${color}`} aria-hidden="true" />
      )}
      <span className="composition-legend__text">
        <strong className="composition-legend__count">{count}</strong>{' '}{label}
      </span>
    </li>
  )
}

// Show current membership in a horseshoe with one sector per party.
export function ChamberComposition({ counts }: ChamberCompositionProps) {
  const [view, setView] = useState<ChamberView>('house')
  const active = counts[view]
  const rankedAffiliations = Object.entries(active.other)
    .sort(([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName))
  const namedGroups = rankedAffiliations
    .slice(0, 3)
    .map(([label, count], index) => ({ color: `minor-${index + 1}`, label, count }))
  // Keep Independents first among tied groups and put the remainder after the named groups.
  const smallerGroups = [
    { color: 'i', label: 'Independents', count: active.I },
    ...namedGroups,
    { color: 'unaffiliated', label: 'Unaffiliated', count: active.unaffiliated },
  ].sort((left, right) => right.count - left.count)
  const overflow = rankedAffiliations.slice(3).reduce((sum, [, count]) => sum + count, 0)
  const democrats = { color: 'd', label: 'Democrats', count: active.D, icon: PARTY_ICON_PATHS.get('D') }
  const republicans = { color: 'r', label: 'Republicans', count: active.R, icon: PARTY_ICON_PATHS.get('R') }
  const additional = [
    ...smallerGroups,
    { color: 'other', label: 'Others', count: overflow },
  ].filter(({ count }) => count > 0)
  const parties = [democrats, ...additional, republicans].filter(({ count }) => count > 0)
  const viewLabel = VIEWS.find(({ value }) => value === view)?.label
  const totalLabel = `${active.total} current ${active.total === 1 ? 'member' : 'members'}`
  const description = [`${viewLabel} seating`, totalLabel, ...parties.map(({ label, count }) => `${label} ${count}`)].join(', ')

  return (
    <div className="composition">
      <div className="composition-toolbar">
        <h2 id="chambers-title">Seats</h2>
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
      </div>

      {active.total > 0 ? (
        <div className="composition-figure">
          <ul className="composition-legend" aria-label="Party counts">
            <PartyLabel {...democrats} />
            <PartyLabel {...republicans} />
          </ul>
          <div className="composition-chart">
            <svg className={`composition-floor composition-floor--${view}`} viewBox="0 0 100 86" role="img" aria-label={description}>
              {seatPositions(view, active.total, parties).map(({ key, color, x, y }) => (
                <circle
                  key={key}
                  aria-hidden="true"
                  className={`composition-dot composition-seat composition-dot--${color}`}
                  cx={x}
                  cy={y}
                  r={SEAT_RADII[view]}
                  strokeWidth={0.3}
                />
              ))}
            </svg>
            <p className="composition-total" aria-hidden="true">
              <span className="composition-total__count">{active.total}</span>
              {active.total === 1 ? 'member' : 'members'}
            </p>
            {additional.length > 0 && (
              <ul className="composition-legend composition-legend--additional" aria-label="Additional affiliations">
                {additional.map((party) => <PartyLabel key={party.color} {...party} />)}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="muted">No current members on record for that view.</p>
      )}
    </div>
  )
}
