import { SearchIcon } from '../icons'

interface EmptyStateProps {
  title: string
  hint?: string
  className?: string
}

export function EmptyState({ title, hint, className }: EmptyStateProps) {
  const classes = `state state--empty${className ? ` ${className}` : ''}`
  return (
    <div className={classes}>
      <span className="state__icon state__icon--muted">
        <SearchIcon />
      </span>
      <div className="state__body">
        <h3>{title}</h3>
        {hint ? <p>{hint}</p> : null}
      </div>
    </div>
  )
}
