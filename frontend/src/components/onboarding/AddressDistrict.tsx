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
import { DistrictChoices } from './DistrictChoices'
import type { DistrictSearchResult } from './DistrictChoices'
import { StepActions } from './StepActions'

type SavedDistrict = Pick<DistrictSelection, 'state' | 'district'>
type SelectDistrict = (district: DistrictSelection, addressToSave?: string) => void

interface AddressDistrictProps {
  initial: DistrictSelection | null
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

interface Selection {
  district: SavedDistrict
  method: 'address' | 'search'
  address?: string
}

function AddressForm({ user, initial, deferSave, nextLabel, onBack, onDone }: AddressDistrictProps & { user: User | null }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<DistrictSearchResult | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saved = useApi(async () => user
    ? request<SavedDistrict | null>('/api/account/district', {
      headers: { Authorization: `Bearer ${await getAccountToken(user)}` },
    })
    : null, [user])

  // Search any address, ZIP code or state, then verify and save a single Census match.
  async function lookup(event: FormEvent) {
    event.preventDefault()
    const value = query.trim()
    if (value.length < 2) {
      setError('Enter a street address, a ZIP code or a state.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    setSelection(null)
    try {
      const found = await request<DistrictSearchResult>('/api/district-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value }),
      })
      const only = found.districts.length === 1 ? found.districts[0] : null
      if (only && found.source === 'address') {
        // Only a single Census match is a verified district, so only it is saved to the account.
        const saveToAccount = user && !deferSave
        const district = saveToAccount ? await saveAccountDistrict(user, value) : only
        setSelection({ district, method: 'address', address: saveToAccount ? undefined : value })
      } else if (only) {
        setSelection({ district: only, method: 'search' })
      }
      setResult(found)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'District lookup is unavailable. Try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  // A chosen search result reopens as chosen, and otherwise the account's verified district wins.
  const fromSearch = initial?.method === 'search'
  const restored = fromSearch ? initial : saved.data ?? initial
  const district = selection?.district ?? (result ? null : restored)
  const method = selection?.method ?? (fromSearch ? 'search' : 'address')
  const search = (
    <button type="submit" className={`btn ${district ? 'btn--secondary' : 'btn--primary'}`} disabled={busy}>
      {busy ? 'Looking up district…' : 'Find district'}
    </button>
  )
  return (
    <div className="onboard-district__address">
      <form className="onboard-form" onSubmit={lookup}>
        <label className="field" htmlFor="district-address">
          <span className="field__label">Address, ZIP code or state</span>
          <input id="district-address" className="field__control" value={query} maxLength={300}
            autoComplete="street-address" aria-describedby="district-address-note" required disabled={busy}
            onChange={(event) => setQuery(event.target.value)} />
        </label>
        <p id="district-address-note" className="muted">
          A full street address finds your exact district through the Census Bureau. A ZIP code or state lists the
          districts it covers so you can choose yours.
        </p>
        {district ? search : <StepActions onBack={onBack}>{search}</StepActions>}
      </form>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {saved.error && !selection ? (
        <p className="form-error" role="alert">
          The saved district could not be loaded.{' '}
          <button type="button" className="link-more" onClick={saved.refetch}>Retry</button>
        </p>
      ) : null}
      {result ? (
        <DistrictChoices
          result={result}
          selected={selection?.district ?? null}
          onSelect={(choice) => setSelection({ district: choice, method: 'search' })}
        />
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
            onClick={() => onDone({ ...district, method }, selection?.address)}>
            {nextLabel}
          </button>
        </StepActions>
      ) : null}
    </div>
  )
}
