import type { ReactNode } from 'react'

// Align the Back button with the action that advances the setup step.
export function StepActions({ onBack, children }: { onBack?: () => void; children?: ReactNode }) {
  if (!onBack && !children) return null
  return (
    <div className="onboard-step__actions">
      {onBack ? <button type="button" className="btn btn--ghost" onClick={onBack}>Back</button> : null}
      {children}
    </div>
  )
}
