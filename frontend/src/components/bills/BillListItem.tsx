import { Link } from 'react-router-dom'
import type { BillSummary } from '../../api/bills'
import { billNumber, formatDate } from '../../lib/format'
import { StatusBadge } from '../ui/StatusBadge'
import { ChamberFlags } from '../ui/ChamberFlags'

interface BillListItemProps {
  bill: BillSummary
  // Hide the latest-action line on pages where the row is the whole context.
  showLatestAction?: boolean
}

// One bill in a list: number, stage, chamber flags, title and latest action.
export function BillListItem({ bill, showLatestAction = true }: BillListItemProps) {
  const to = `/bills/${bill.congress}/${bill.type}/${bill.number}`
  return (
    <li className="bill-list__item">
      <Link to={to} className="bill-list__link">
        <span className="bill-list__top">
          <span className="bill-list__id">{billNumber(bill.type, bill.number)}</span>
          <StatusBadge status={bill.status} />
          <ChamberFlags passedHouse={bill.passed_house} passedSenate={bill.passed_senate} />
        </span>
        <span className="bill-list__title">{bill.title}</span>
        {showLatestAction && bill.latest_action_text ? (
          <span className="bill-list__action">
            {bill.latest_action_date ? (
              <>
                <time dateTime={bill.latest_action_date}>{formatDate(bill.latest_action_date)}</time>
                <span className="bill-list__dot" aria-hidden="true">
                  ·
                </span>
              </>
            ) : null}
            <span className="bill-list__action-text">{bill.latest_action_text}</span>
          </span>
        ) : null}
      </Link>
    </li>
  )
}
