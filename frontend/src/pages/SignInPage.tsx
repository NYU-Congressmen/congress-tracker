import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from '@firebase/auth'
import type { ConfirmationResult } from '@firebase/auth'
import { Link } from 'react-router-dom'
import { loadFirebaseAuth, phoneSignInMessage } from '../auth/firebase'
import { useSession } from '../auth/SessionContext'
import { PageBand } from '../components/layout/PageBand'

export default function SignInPage() {
  const { user, loading, error: sessionError, retry } = useSession()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const verifier = useRef<RecaptchaVerifier | null>(null)

  function clearVerifier() {
    verifier.current?.clear()
    verifier.current = null
    container.current?.replaceChildren()
  }

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Phone sign-in | Pull'
    return () => {
      document.title = previousTitle
      verifier.current?.clear()
      verifier.current = null
    }
  }, [])

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    const number = phone.replace(/[\s().-]/g, '')
    if (!/^\+[1-9]\d{6,14}$/.test(number)) {
      setError('Enter a phone number with its country code.')
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
      setError(phoneSignInMessage(cause, 'The verification code could not be requested.'))
    } finally {
      clearVerifier()
      setBusy(false)
    }
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault()
    if (!confirmation) return
    setError(null)
    setBusy(true)
    try {
      await confirmation.confirm(code.trim())
      setCode('')
      setConfirmation(null)
    } catch (cause) {
      setError(phoneSignInMessage(cause, 'The verification code could not be confirmed.'))
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
    <>
      <PageBand labelledBy="sign-in-title">
        <h1 id="sign-in-title" className="page-title">Phone sign-in</h1>
      </PageBand>
      <div className="container page-body">
        <section className="panel sign-in-panel" aria-label="Phone sign-in">
          {loading ? <p role="status">Checking your account…</p> : null}
          {!loading && user ? (
            <div className="onboard-form">
              <p role="status">You’re signed in.</p>
              <Link to="/social" className="btn btn--primary">Go to discussions</Link>
              <button className="btn btn--secondary" type="button" onClick={leave} disabled={busy}>Sign out</button>
            </div>
          ) : null}
          {!loading && sessionError ? (
            <div className="onboard-form">
              <p className="form-error" role="alert">{sessionError}</p>
              <button className="btn btn--primary" type="button" onClick={retry}>Retry account setup</button>
              <button className="btn btn--secondary" type="button" onClick={leave} disabled={busy}>Sign out</button>
            </div>
          ) : null}
          {!loading && !user && !sessionError && !confirmation ? (
            <form className="onboard-form" onSubmit={sendCode}>
              <p className="muted">Google verifies your phone number, and Pull saves it with your account.</p>
              <label className="field">
                <span className="field__label">Phone number with country code</span>
                <input className="field__control" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
              </label>
              <button className="btn btn--primary" type="submit" disabled={busy}>Request code</button>
            </form>
          ) : null}
          {!loading && !user && !sessionError && confirmation ? (
            <form className="onboard-form" onSubmit={confirmCode}>
              <label className="field">
                <span className="field__label">Verification code</span>
                <input className="field__control" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} pattern="[0-9]{6}" required />
              </label>
              <button className="btn btn--primary" type="submit" disabled={busy}>Verify code</button>
              <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => {
                setConfirmation(null)
                setCode('')
                setError(null)
              }}>Request a new code</button>
            </form>
          ) : null}
          <div ref={container} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </section>
      </div>
    </>
  )
}
