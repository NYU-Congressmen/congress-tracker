import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../auth/SessionContext'
import { isUsernameTaken, listSelectableUsernames, listUsernames, usernameError } from '../../profile/store'
import { SelectField, TextField } from '../ui/Fields'
import { StepActions } from './StepActions'

interface AccountStepProps {
  initialName: string
  next: 'district' | 'topics' | 'save'
  onBack?: () => void
  onCreate: (username: string) => void
  onSelect?: (username: string) => void
}

// Return the first numbered variant available in this browser.
function suggestProfileName(name: string, names: string[]): string {
  const used = new Set(names.map((existing) => existing.toLowerCase()))
  let number = 2
  while (used.has(`${name.toLowerCase()}-${number}`)) number += 1
  return `${name}-${number}`
}

// Choose a saved local profile or name a new one.
export function AccountStep({ initialName, next, onBack, onCreate, onSelect }: AccountStepProps) {
  const { user, loading } = useSession()
  const editing = next === 'save'
  const names = listSelectableUsernames(user?.uid)
  const [username, setUsername] = useState(initialName)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)

  function create(event: FormEvent) {
    event.preventDefault()
    const problem = usernameError(username)
    const unchangedName = editing && username.trim().toLowerCase() === initialName.toLowerCase()
    if (problem || (!unchangedName && isUsernameTaken(username))) {
      setError(problem ?? 'That name is already used by a profile on this device.')
      setSuggestion(problem ? null : suggestProfileName(username.trim(), listUsernames()))
      return
    }
    onCreate(username.trim())
  }

  return (
    <div className="onboard-account">
      <form className="onboard-form" onSubmit={create}>
        <div className="onboard-account__intro">
          <h2>{editing ? 'Browser profile' : 'New profile'}</h2>
          <p className="muted">Save your district, topics and social handles on this browser.</p>
        </div>
        <TextField id="onboard-username" label="Profile name" value={username} onChange={(value) => {
          setUsername(value)
          setError(null)
          setSuggestion(null)
        }} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {suggestion ? (
          <button type="button" className="btn btn--secondary" onClick={() => {
            setUsername(suggestion)
            setError(null)
            setSuggestion(null)
            document.getElementById('onboard-username')?.focus()
          }}>
            Use {suggestion}
          </button>
        ) : null}
        <StepActions onBack={onBack}>
          <button type="submit" className="btn btn--primary">
            {editing ? 'Save profile name' : next === 'district' ? 'Continue to your district' : 'Continue to topics'}
          </button>
        </StepActions>
      </form>
      {onSelect && names.length > 0 ? (
        <form className="onboard-form" onSubmit={(event) => {
          event.preventDefault()
          if (selected) onSelect(selected)
        }}>
          <SelectField
            id="onboard-profile"
            label="Saved profile"
            value={selected}
            onChange={setSelected}
            options={[{ value: '', label: 'Choose a profile' }, ...names.map((name) => ({ value: name, label: name }))]}
          />
          <button type="submit" className="btn btn--secondary" disabled={!selected}>
            Open profile
          </button>
        </form>
      ) : null}
      {next === 'district' && !user && !loading ? (
        <div className="onboard-account__signin">
          <p className="muted">Already have a Pull account?</p>
          <Link to="/sign-in?next=onboarding" className="btn btn--secondary">Sign in</Link>
        </div>
      ) : null}
    </div>
  )
}
