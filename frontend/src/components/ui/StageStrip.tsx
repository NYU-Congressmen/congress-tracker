import { BILL_STATUSES, type BillStatus } from '../../api/bills'

interface StageStripProps {
  status: BillStatus
}

// Six cells of the same size on every page, filled up to the bill's stage, so
// any two bills compare at a glance. Laws fill in the highlight color.
export function StageStrip({ status }: StageStripProps) {
  const reached = BILL_STATUSES.indexOf(status) + 1
  const total = BILL_STATUSES.length
  return (
    <span
      className={`stage-strip${status === 'became_law' ? ' stage-strip--law' : ''}`}
      role="img"
      aria-label={`Stage ${reached} of ${total}`}
    >
      {BILL_STATUSES.map((stage, index) => (
        <i key={stage} className={index < reached ? 'on' : undefined} />
      ))}
    </span>
  )
}
