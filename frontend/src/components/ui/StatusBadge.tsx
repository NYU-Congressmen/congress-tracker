import type { BillStatus } from '../../api/bills'
import { STATUS_LABELS } from '../../lib/constants'

interface StatusBadgeProps {
  status: BillStatus
  className?: string
}

// Colored pill for a bill's legislative stage. The CSS hook is the status
// value itself, so new stages only need a label plus a color rule.
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const classes = `status-badge status-badge--${status}${className ? ` ${className}` : ''}`
  return (
    <span className={classes}>
      <span className="status-badge__dot" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
