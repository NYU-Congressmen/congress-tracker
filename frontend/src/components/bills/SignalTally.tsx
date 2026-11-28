import type { SignalCounts } from '../../api/signal'

// Show one office's Constituent Signal counts in a line, or say there are too few to show.
export function SignalTally({ counts, minimum }: { counts: SignalCounts; minimum: number }) {
  if (counts.withheld) {
    return <span className="signal-tally signal-tally--withheld">Fewer than {minimum} constituents counted this week</span>
  }
  return (
    <span className="signal-tally">
      <strong>{counts.support}</strong> support · <strong>{counts.oppose}</strong> oppose ·{' '}
      <strong>{counts.unsure}</strong> unsure · <strong>{counts.calls}</strong> {counts.calls === 1 ? 'call' : 'calls'}
    </span>
  )
}
