import { useState } from 'react'
import type { FormEvent } from 'react'
import { isUsernameTaken, listUsernames, usernameError } from '../../profile/store'
import { SelectField, TextField } from '../ui/Fields'

interface AccountStepProps {
  onCreate: (username: string) => void
  onSelect: (username: string) => void
}

// Choose a saved local profile or name a new one.
export function AccountStep({ onCreate, onSelect }: AccountStepProps) {
  const names = listUsernames()
  const [username, setUsername] = useState('')
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)

  function create(event: FormEvent) {
    event.preventDefault()
    const problem = usernameError(username)
    if (problem || isUsernameTaken(username)) {
      setError(problem ?? 'That name is already used by a profile on this device.')
      return
    }
    onCreate(username.trim())
  }

  return (
    <div className="onboard-step">
      <p className="muted">Profiles are saved in this browser and can be opened by anyone using it.</p>
      {names.length > 0 ? (
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
      <form className="onboard-form" onSubmit={create}>
        <TextField id="onboard-username" label="New profile name" value={username} onChange={setUsername} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn--primary btn--lg">Continue to your district</button>
      </form>
    </div>
  )
}
