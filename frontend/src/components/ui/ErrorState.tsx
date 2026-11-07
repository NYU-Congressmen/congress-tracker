import { AlertIcon } from '../icons'

interface ErrorStateProps {
  title: string
  message?: string
  onRetry?: () => void
  className?: string
}

// Friendly failure panel with an optional retry action.
export function ErrorState({ title, message, onRetry, className }: ErrorStateProps) {
  const classes = `state state--error${className ? ` ${className}` : ''}`
  return (
    <div className={classes} role="alert">
      <span className="state__icon">
        <AlertIcon />
      </span>
      <div className="state__body">
        <h3>{title}</h3>
        {message ? <p>{message}</p> : null}
      </div>
      {onRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}
