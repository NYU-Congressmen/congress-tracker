import { useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@firebase/auth'
import { ApiError, request } from '../../api/client'
import { saveAccountDistrict } from '../../api/account'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { useApi } from '../../hooks/useApi'
import { districtHeading } from '../../lib/districts'
import type { DistrictSelection } from '../../profile/types'
import { StepActions } from './StepActions'

type SavedDistrict = Pick<DistrictSelection, 'state' | 'district'>
type SelectDistrict = (district: DistrictSelection, addressToSave?: string) => void

interface AddressDistrictProps {
  initial: SavedDistrict | null
  deferSave?: boolean
  nextLabel: string
  onBack?: () => void
  onDone: SelectDistrict
}

// Look up a district for a browser profile and save the match to a signed-in account.
export function AddressDistrict(props: AddressDistrictProps) {
  const { user, loading } = useSession()
  if (loading) return (
    <>
      <p role="status">Checking your account…</p>
      <StepActions onBack={props.onBack} />
    </>
  )
  return <AddressForm key={user?.uid} user={user} {...props} />
}

function AddressForm({ user, initial, deferSave, nextLabel, onBack, onDone }: AddressDistrictProps & { user: User | null }) {
  const [address, setAddress] = useState('')
  const [match, setMatch] = useState<{ district: SavedDistrict; address?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saved = useApi(async () => user
    ? request<SavedDistrict | null>('/api/account/district', {
      headers: { Authorization: `Bearer ${await getAccountToken(user)}` },
    })
    : null, [user])

  async function lookup(event: FormEvent) {
    event.preventDefault()
    const value = address.trim()
    if (value.length < 5) {
      setError('Enter a street address with city and state or ZIP code.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saveToAccount = user && !deferSave
      const result = saveToAccount ? await saveAccountDistrict(user, value)
        : await request<SavedDistrict>('/api/district-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: value }),
        })
      setMatch({ district: result, address: saveToAccount ? undefined : value })
      setAddress('')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'District lookup is unavailable. Try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  const district = match?.district ?? saved.data ?? initial
  const findDistrict = (
    <button type="submit" className={`btn ${district ? 'btn--secondary' : 'btn--primary'}`} disabled={busy}>
      {busy ? 'Looking up district…' : 'Find district'}
    </button>
  )
  return (
    <div className="onboard-district__address">
      <form className="onboard-form" onSubmit={lookup}>
        <label className="field" htmlFor="district-address">
          <span className="field__label">Street address</span>
          <input id="district-address" className="field__control" value={address} maxLength={300}
            autoComplete="street-address" aria-describedby="district-address-note" required disabled={busy}
            onChange={(event) => setAddress(event.target.value)} />
        </label>
        <p id="district-address-note" className="muted">
          Include the city and state or ZIP code. The Census Bureau uses your address to find your district.
        </p>
        {district ? findDistrict : <StepActions onBack={onBack}>{findDistrict}</StepActions>}
      </form>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {saved.error && !match ? (
        <p className="form-error" role="alert">
          The saved district could not be loaded.{' '}
          <button type="button" className="link-more" onClick={saved.refetch}>Retry</button>
        </p>
      ) : null}
      {district ? (
        <p className="onboard-choice" role="status">
          <span className="onboard-choice__label">Your district</span>{' '}
          <strong>{districtHeading(district.state, district.district)}</strong>
        </p>
      ) : null}
      {district ? (
        <StepActions onBack={onBack}>
          <button type="button" className="btn btn--primary" disabled={busy}
            onClick={() => onDone({ ...district, method: 'address' }, match?.address)}>
            {nextLabel}
          </button>
        </StepActions>
      ) : null}
    </div>
  )
}
