import type { BillAction } from '../../api/bills'
import { formatDate } from '../../lib/format'

interface ActionTimelineProps {
  actions: BillAction[]
}

// The bill's action history in the sequence supplied by Congress.gov.
export function ActionTimeline({ actions }: ActionTimelineProps) {
  if (actions.length === 0) {
    return <p className="muted">No action history has been recorded for this bill yet.</p>
  }
  return (
    <ol className="timeline">
      {actions.map((action, index) => (
        <li key={index} className="timeline__item">
          {action.action_date ? (
            <time className="timeline__date" dateTime={action.action_date}>
              {formatDate(action.action_date)}
            </time>
          ) : (
            <span className="timeline__date" aria-hidden="true">
              &nbsp;
            </span>
          )}
          <div className="timeline__content">
            {action.text ? <p className="timeline__text">{action.text}</p> : <p className="timeline__text muted">—</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
