import type { PartyCounts } from '../../lib/stats'
import { PARTY_LABELS } from '../../lib/constants'

interface PartyCompositionProps {
  counts: PartyCounts
}

const ROWS: { code: 'R' | 'D' | 'I' }[] = [
  { code: 'R' },
  { code: 'D' },
  { code: 'I' },
]

// Party split of the current membership, with proportional bars.
export function PartyComposition({ counts }: PartyCompositionProps) {
  const total = Math.max(counts.total, 1)
  return (
    <ul className="party-list">
      {ROWS.map(({ code }) => {
        const count = counts[code]
        return (
          <li key={code} className={`party-row party-row--${code.toLowerCase()}`}>
            <span className="party-row__label">
              <span className="party-dot" aria-hidden="true" />
              {PARTY_LABELS[code] ?? code}
            </span>
            <span className="party-row__count">{count}</span>
            <span className="party-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((count / total) * 100)}%` }} />
            </span>
          </li>
        )
      })}
      <li className="party-row party-row--total">
        <span className="party-row__label">Current members</span>
        <span className="party-row__count">{counts.total}</span>
      </li>
    </ul>
  )
}
