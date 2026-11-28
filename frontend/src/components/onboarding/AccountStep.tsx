import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../auth/SessionContext'
import { usernameError } from '../../profile/store'
import { TextField } from '../ui/Fields'
import { StepActions } from './StepActions'

interface AccountStepProps {
  initialName: string
  next: 'district' | 'topics' | 'save'
  onBack?: () => void
  onCreate: (username: string) => void
}

// Name the profile that phone verification saves to the account.
export function AccountStep({ initialName, next, onBack, onCreate }: AccountStepProps) {
  const { user, loading } = useSession()
  const editing = next === 'save'
  const [username, setUsername] = useState(initialName)
  const [error, setError] = useState<string | null>(null)

  function create(event: FormEvent) {
    event.preventDefault()
    const problem = usernameError(username)
    if (problem) {
      setError(problem)
      return
    }
    onCreate(username.trim())
  }

  return (
    <div className="onboard-account">
      <form className="onboard-form" onSubmit={create}>
        <div className="onboard-account__intro">
          <h2>{editing ? 'Profile name' : 'New profile'}</h2>
        </div>
        <TextField id="onboard-username" label="Profile name" value={username} onChange={(value) => {
          setUsername(value)
          setError(null)
        }} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <StepActions onBack={onBack}>
          <button type="submit" className="btn btn--primary">
            {editing ? 'Save profile name' : next === 'district' ? 'Continue to your district' : 'Continue to topics'}
          </button>
        </StepActions>
      </form>
      {next === 'district' && !user && !loading ? (
        <div className="onboard-account__signin">
          <p className="muted">Already have a Pull account?</p>
          <Link to="/sign-in?next=onboarding" className="btn btn--secondary">Sign in</Link>
        </div>
      ) : null}
    </div>
  )
}
