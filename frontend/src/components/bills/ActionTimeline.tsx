import type { BillAction } from '../../api/bills'
import { threadRows } from '../../lib/actionThread'
import { formatDate } from '../../lib/format'
import { CheckIcon } from '../icons'

interface ActionTimelineProps {
  actions: BillAction[]
}

// The bill's action history as a conversation between the chambers, oldest first.
export function ActionTimeline({ actions }: ActionTimelineProps) {
  if (actions.length === 0) {
    return <p className="muted chat__empty">No action history has been recorded for this bill yet.</p>
  }
  return (
    <ol className="thread">
      {threadRows(actions).map((row, index) => {
        if (row.kind === 'date') {
          return (
            <li key={index} className="thread__stamp">
              <time dateTime={row.date}>{formatDate(row.date)}</time>
            </li>
          )
        }
        if (row.kind === 'event') {
          return (
            <li key={index} className="thread__event">
              <CheckIcon size={14} />
              <span>{row.text}</span>
            </li>
          )
        }
        return (
          <li key={index} className="thread__msg">
            <span className="thread__who">{row.who}</span>
            <span className="thread__bubble">{row.text}</span>
          </li>
        )
      })}
    </ol>
  )
}
