import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { BillSummary } from '../../api/bills'
import { billNumber, formatDate } from '../../lib/format'
import { StatusBadge } from '../ui/StatusBadge'
import { StageStrip } from '../ui/StageStrip'

interface BillListItemProps {
  bill: BillSummary
  // Hide the latest-action line on pages where the row is the whole context.
  showLatestAction?: boolean
  // Flag a tracked bill whose latest action the reader has not opened yet.
  isNew?: boolean
  // An extra line under the latest action, such as the reader's own stance and calls
  note?: ReactNode
}

// One bill in a list. The bill number leads, the way reporters cite bills,
// with the stage strip and label under it and the title and latest action beside.
export function BillListItem({ bill, showLatestAction = true, isNew = false, note }: BillListItemProps) {
  const to = `/bills/${bill.congress}/${bill.type}/${bill.number}`
  return (
    <li className="bill-list__item">
      <Link to={to} className="entry">
        <span className="entry__num">{billNumber(bill.type, bill.number)}</span>
        <span className="entry__stage">
          <StageStrip status={bill.status} />
          <StatusBadge status={bill.status} />
        </span>
        <span className="entry__title">
          {isNew ? <span className="entry__new">New update</span> : null}
          {bill.title}
        </span>
        {showLatestAction && bill.latest_action_text ? (
          <span className="entry__action">
            {bill.latest_action_date ? (
              <time dateTime={bill.latest_action_date}>{formatDate(bill.latest_action_date)}</time>
            ) : null}
            {bill.latest_action_text}
          </span>
        ) : null}
        {note ? <span className="entry__note">{note}</span> : null}
      </Link>
    </li>
  )
}
