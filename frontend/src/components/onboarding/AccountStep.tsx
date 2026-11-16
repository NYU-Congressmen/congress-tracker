import { useState } from 'react'
import type { FormEvent } from 'react'
import { useProfile } from '../../profile/ProfileContext'
import { isUsernameTaken, listUsernames, usernameError } from '../../profile/store'
import { TextField } from '../ui/Fields'

interface AccountStepProps {
  // Signup hands the wizard the credentials; sign-in completes immediately.
  onDone: (username: string, password: string | null) => void
}

// Step one: choose a username and password, or sign in to one on this device.
export function AccountStep({ onDone }: AccountStepProps) {
  const { signIn } = useProfile()
  const [mode, setMode] = useState<'signup' | 'signin'>(() => (listUsernames().length > 0 ? 'signin' : 'signup'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    // Validate with the store's own rules, so a name accepted here can never
    // be rejected later when the account is actually created.
    const problem = usernameError(username)
    if (problem) {
      setError(problem)
      return
    }
    if (mode === 'signup') {
      if (isUsernameTaken(username)) {
        setError('That username is taken on this device. Sign in instead, or pick another.')
        return
      }
      if (password.length < 8) {
        setError('Choose a password with at least 8 characters.')
        return
      }
      if (password !== confirm) {
        setError('The passwords do not match.')
        return
      }
      // The wizard creates the account at the end, so a username is claimed
      // only when the whole setup is finished.
      onDone(username, password)
      return
    }
    try {
      signIn(username, password)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Try again.')
      return
    }
    onDone(username, null)
  }

  return (
    <div className="onboard-step">
      <div className="onboard-step__modes" role="group" aria-label="Sign in or create an account">
        <button
          type="button"
          className={`btn btn--sm ${mode === 'signup' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => {
            setMode('signup')
            setError(null)
          }}
        >
          Create an account
        </button>
        <button
          type="button"
          className={`btn btn--sm ${mode === 'signin' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => {
            setMode('signin')
            setError(null)
          }}
        >
          Sign in
        </button>
      </div>

      <form className="onboard-form" onSubmit={submit}>
        <TextField
          id="onboard-username"
          label={mode === 'signup' ? 'Choose a username' : 'Username'}
          value={username}
          onChange={setUsername}
          placeholder="e.g. civics-maya"
        />
        <TextField
          id="onboard-password"
          label={mode === 'signup' ? 'Choose a password' : 'Password'}
          type="text"
          value={password}
          onChange={setPassword}
          placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
        />
        {mode === 'signup' ? (
          <TextField
            id="onboard-confirm"
            label="Confirm the password"
            type="text"
            value={confirm}
            onChange={setConfirm}
            placeholder="Type the password again"
          />
        ) : null}
        {mode === 'signup' ? (
          <p className="muted onboard-note">
            Sign-in through the backend goes live in a coming release. Until then your account and profile are stored
            on this device, and you can sign back in from this page any time.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn--primary btn--lg">
          {mode === 'signup' ? 'Continue to your district' : 'Sign in and continue'}
        </button>
      </form>
    </div>
  )
}
