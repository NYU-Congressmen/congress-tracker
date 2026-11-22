import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from '@firebase/auth'
import type { ConfirmationResult } from '@firebase/auth'
import { loadFirebaseAuth, phoneSignInMessage } from '../../auth/firebase'
import { useSession } from '../../auth/SessionContext'
import { StepActions } from '../onboarding/StepActions'

// Add the country code for an unprefixed U.S. number.
function normalizePhone(value: string): string {
  const phone = value.replace(/[\s().-]/g, '')
  if (/^\d{10}$/.test(phone)) return `+1${phone}`
  if (/^1\d{10}$/.test(phone)) return `+${phone}`
  return phone
}

// Request a verification code and wait for the registered phone session.
export default function PhoneAuthForm({
  onBack, onCodeFailure,
}: { onBack?: () => void; onCodeFailure?: () => void }) {
  const { user, loading, error: sessionError, retry } = useSession()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const helpId = useId()
  const errorId = useId()
  const container = useRef<HTMLDivElement>(null)
  const verifier = useRef<RecaptchaVerifier | null>(null)

  function clearVerifier() {
    verifier.current?.clear()
    verifier.current = null
    container.current?.replaceChildren()
  }

  useEffect(() => {
    return () => {
      verifier.current?.clear()
      verifier.current = null
    }
  }, [])

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    const number = normalizePhone(phone)
    if (!/^\+[1-9]\d{6,14}$/.test(number)) {
      setError('Enter a 10-digit U.S. number or start with + and the country code.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const auth = await loadFirebaseAuth()
      if (!container.current) return
      const theme = getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light'
      // Create a new challenge after each attempt because reCAPTCHA tokens are single-use.
      verifier.current = new RecaptchaVerifier(auth, container.current, { size: 'invisible', theme })
      const result = await signInWithPhoneNumber(auth, number, verifier.current)
      setConfirmation(result)
    } catch (cause) {
      setError(phoneSignInMessage(cause, 'We couldn’t request a code. Try again.'))
    } finally {
      clearVerifier()
      setBusy(false)
    }
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault()
    if (!confirmation || busy) return
    setError(null)
    setBusy(true)
    try {
      await confirmation.confirm(code.trim())
      setCode('')
      setConfirmation(null)
    } catch (cause) {
      setError(phoneSignInMessage(cause, 'We couldn’t verify that code. Check it and try again.'))
      onCodeFailure?.()
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    setError(null)
    setBusy(true)
    try {
      await signOut(await loadFirebaseAuth())
      setPhone('')
    } catch {
      setError('You could not be signed out. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboard-phone">
      {loading ? (
        <>
          <p role="status">Checking your account…</p>
          <StepActions onBack={onBack} />
        </>
      ) : null}
      {!loading && sessionError ? (
        <div className="onboard-form">
          <p className="form-error" role="alert">{sessionError}</p>
          <button className="btn btn--secondary" type="button" onClick={leave} disabled={busy}>Sign out</button>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <StepActions onBack={onBack}>
            <button className="btn btn--primary" type="button" onClick={retry}>Retry account setup</button>
          </StepActions>
        </div>
      ) : null}
      {!loading && !user && !sessionError && !confirmation ? (
        <form className="onboard-form" onSubmit={sendCode}>
          <p className="muted">Google verifies your phone number, and Pull saves it with your account.</p>
          <label className="field">
            <span className="field__label">Phone number</span>
            <input
              className="field__control"
              type="tel"
              autoComplete="tel"
              aria-describedby={error ? `${helpId} ${errorId}` : helpId}
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
                setError(null)
              }}
              required
            />
          </label>
          <p id={helpId} className="muted">Enter 10 digits for a U.S. number. For other numbers, include + and the country code.</p>
          {error ? <p id={errorId} className="form-error" role="alert">{error}</p> : null}
          <StepActions onBack={onBack}>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Requesting code…' : 'Request code'}
            </button>
          </StepActions>
        </form>
      ) : null}
      {!loading && !user && !sessionError && confirmation ? (
        <form className="onboard-form" onSubmit={confirmCode}>
          <label className="field">
            <span className="field__label">Verification code</span>
            <input className="field__control" inputMode="numeric" autoComplete="one-time-code"
              aria-describedby={error ? errorId : undefined} value={code} onChange={(event) => setCode(event.target.value)}
              pattern="[0-9]{6}" required />
          </label>
          {error ? <p id={errorId} className="form-error" role="alert">{error}</p> : null}
          <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => {
            setConfirmation(null)
            setCode('')
            setError(null)
          }}>Request a new code</button>
          <StepActions onBack={onBack}>
            <button className="btn btn--primary" type="submit" disabled={busy}>Verify code</button>
          </StepActions>
        </form>
      ) : null}
      <div ref={container} />
    </div>
  )
}
