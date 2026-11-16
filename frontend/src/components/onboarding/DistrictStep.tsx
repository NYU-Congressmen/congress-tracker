import { useState } from 'react'
import type { FormEvent } from 'react'
import { districtsInState, districtAtPoint, stateDistrictGeometry } from '../../geo/census'
import { geocodeAddress } from '../../geo/geocoder'
import { simplifyFeatureCollection } from '../../geo/simplify'
import type { FeatureCollection } from '../../geo/simplify'
import { STATE_OPTIONS } from '../../lib/constants'
import { isAtLargeState, stateName } from '../../lib/districts'
import type { DistrictSelection } from '../../profile/types'
import { DistrictMap } from './DistrictMap'
import { SelectField, TextField } from '../ui/Fields'
import { LoadingState } from '../ui/LoadingState'

type Method = 'address' | 'map' | 'number'

interface DistrictStepProps {
  initial: DistrictSelection | null
  onDone: (selection: DistrictSelection) => void
}

// The state's district boundaries, simplified once and kept in memory, so
// revisiting the step does not re-download tens of megabytes.
const geometryCache = new Map<string, FeatureCollection>()

// The whole-state point budget for the map: dense enough that every boundary
// stays smooth at any zoom (a deviation-based decimation of this data
// zig-zags), sparse enough that the SVG stays a few hundred kilobytes at
// most. Sharp corners are kept on top of the budget, so the total is a
// little higher for states with many hard angles.
const DIST_MAP_POINTS = 4000

// "street", "street and city", "street, city and ZIP"
function listWords(words: string[]): string {
  if (words.length === 1) return words[0]
  if (words.length === 2) return `${words[0]} and ${words[1]}`
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

// Step two: choose the congressional district by address, on the map, or by
// number. At-large seats (the District of Columbia, the territories) confirm
// as a single "no district" choice.
export function DistrictStep({ initial, onDone }: DistrictStepProps) {
  const [method, setMethod] = useState<Method>('address')
  const [choice, setChoice] = useState<DistrictSelection | null>(initial)

  // Address method: the street, city, state and ZIP are separate fields, so
  // the lookup does not depend on how a free-form address is written.
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [addrState, setAddrState] = useState('')
  const [zip, setZip] = useState('')
  const [status, setStatus] = useState<'idle' | 'working' | 'found' | 'none' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  // Map method
  const [mapState, setMapState] = useState(initial?.state ?? '')
  const [mapGeometry, setMapGeometry] = useState<FeatureCollection | null>(() =>
    initial?.state ? geometryCache.get(initial.state) ?? null : null,
  )
  const [mapLoading, setMapLoading] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Number method
  const [numState, setNumState] = useState(initial?.state ?? '')
  const [numOptions, setNumOptions] = useState<number[] | null>(initial ? [initial.district ?? 1] : null)
  const [numLoading, setNumLoading] = useState(false)
  const [numError, setNumError] = useState<string | null>(null)
  const [numPick, setNumPick] = useState('')

  function confirm(state: string, district: number | null, via: Method) {
    setChoice({ state, district, method: via })
  }

  async function findAddress(event: FormEvent) {
    event.preventDefault()
    if (!addrState) {
      setStatus('error')
      setStatusMessage('Choose the state or territory, and we will find the right seat.')
      return
    }
    // The District of Columbia and the territories elect a single at-large
    // delegate, so the answer is already known: confirm the seat right away
    // instead of geocoding and querying the district boundaries.
    if (isAtLargeState(addrState)) {
      confirm(addrState, null, 'address')
      setStatus('found')
      setStatusMessage(
        `${stateName(addrState)} elects an at-large delegate, so there is no numbered district to pick.`,
      )
      return
    }
    const missing = [
      ...(!street.trim() ? ['street'] : []),
      ...(!city.trim() ? ['city'] : []),
      ...(!zip.trim() ? ['ZIP'] : []),
    ]
    if (missing.length > 0) {
      setStatus('error')
      setStatusMessage(`Enter the ${listWords(missing)} so we can look up the district.`)
      return
    }
    if (!/^\d{5}(-?\d{4})?$/.test(zip.trim())) {
      setStatus('error')
      setStatusMessage('Enter a 5-digit ZIP code, for example 90013.')
      return
    }
    setStatus('working')
    setStatusMessage('')
    try {
      const query = `${street.trim()}, ${city.trim()}, ${stateName(addrState)} ${zip.trim()}`
      const point = await geocodeAddress(query)
      if (!point) {
        setStatus('none')
        setStatusMessage('No match for that address. Check the spelling, or pick the district on the map instead.')
        return
      }
      const hit = await districtAtPoint(point.lat, point.lng)
      // The state the reader chose is authoritative; the geocoder's state is
      // used to flag an address that resolves somewhere else.
      if (hit && hit.state !== addrState) {
        setStatus('none')
        setStatusMessage(
          `That address appears to be in ${stateName(hit.state)}, not ${stateName(addrState)}. Check the state choice, or pick the district on the map.`,
        )
        return
      }
      if (hit) {
        confirm(addrState, hit.district, 'address')
        setStatus('found')
        setStatusMessage(`That address is in ${stateName(addrState)}, District ${hit.district}.`)
        return
      }
      setStatus('none')
      setStatusMessage(
        `That address is in ${stateName(addrState)}, but its district could not be matched. Pick it on the map or by number.`,
      )
    } catch (cause) {
      setStatus('error')
      setStatusMessage(cause instanceof Error ? cause.message : 'The address lookup failed. Try again.')
    }
  }

  async function loadMapState(state: string) {
    setMapState(state)
    setMapError(null)
    const cached = geometryCache.get(state)
    if (cached) {
      setMapGeometry(cached)
      return
    }
    setMapGeometry(null)
    setMapLoading(true)
    try {
      const raw = await stateDistrictGeometry(state)
      const simplified = simplifyFeatureCollection(raw, DIST_MAP_POINTS)
      geometryCache.set(state, simplified)
      setMapGeometry(simplified)
    } catch (cause) {
      setMapError(cause instanceof Error ? cause.message : 'The district map could not be loaded.')
    } finally {
      setMapLoading(false)
    }
  }

  async function loadNumberOptions(state: string) {
    setNumState(state)
    setNumError(null)
    setNumOptions(null)
    setNumPick('')
    if (isAtLargeState(state)) {
      setNumOptions([])
      return
    }
    setNumLoading(true)
    try {
      const options = await districtsInState(state)
      setNumOptions(options)
      if (options.length === 1) setNumPick(String(options[0]))
    } catch (cause) {
      setNumError(cause instanceof Error ? cause.message : 'The district list could not be loaded.')
    } finally {
      setNumLoading(false)
    }
  }

  const methodTabs: { id: Method; label: string }[] = [
    { id: 'address', label: 'Enter your address' },
    { id: 'map', label: 'Pick it on the map' },
    { id: 'number', label: 'Pick the number' },
  ]

  return (
    <div className="onboard-step">
      <div className="onboard-step__modes" role="tablist" aria-label="How to choose your district">
        {methodTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={method === tab.id}
            className={`btn btn--sm ${method === tab.id ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setMethod(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {method === 'address' ? (
        <div className="onboard-address">
          <form onSubmit={findAddress} className="onboard-address__form">
            <div className="onboard-address__grid">
              <TextField
                id="district-street"
                label="Street"
                value={street}
                onChange={setStreet}
                placeholder="1600 Pennsylvania Ave NW"
              />
              <TextField
                id="district-city"
                label="City"
                value={city}
                onChange={setCity}
                placeholder="Washington"
              />
              <SelectField
                id="district-state"
                label="State or territory"
                value={addrState}
                onChange={setAddrState}
                options={[{ value: '', label: 'Choose a state or territory' }, ...STATE_OPTIONS]}
              />
              <TextField
                id="district-zip"
                label="ZIP code"
                value={zip}
                onChange={setZip}
                placeholder="20500"
              />
            </div>
            {addrState && isAtLargeState(addrState) ? (
              <p className="muted">
                {stateName(addrState)} elects an at-large delegate, so the street, city and ZIP are optional here.
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={status === 'working'}>
              {status === 'working' ? 'Looking it up…' : 'Find my district'}
            </button>
          </form>
          {status === 'working' ? <LoadingState message="Finding the district for that address…" /> : null}
          {statusMessage ? (
            <p
              className={status === 'found' ? 'onboard-found' : status === 'error' ? 'form-error' : 'muted'}
              role={status === 'error' ? 'alert' : 'status'}
            >
              {statusMessage}
            </p>
          ) : null}
          {status === 'none' || status === 'error' ? (
            <p className="muted">
              You can also <button type="button" className="link-more" onClick={() => setMethod('map')}>pick the district on the map</button> or{' '}
              <button type="button" className="link-more" onClick={() => setMethod('number')}>pick the district number</button>.
            </p>
          ) : null}
        </div>
      ) : null}

      {method === 'map' ? (
        <div className="onboard-map">
          <div className="onboard-map__controls">
            <SelectField
              id="district-state-map"
              label="State or territory"
              value={mapState}
              onChange={(value) => {
                loadMapState(value)
                confirm(value, null, 'map')
              }}
              options={[{ value: '', label: 'Choose a state or territory' }, ...STATE_OPTIONS]}
            />
            <p className="muted">
              First choose the state or territory, then zoom in and click your district.
            </p>
          </div>
          {isAtLargeState(mapState) ? (
            <div className="onboard-atlarge">
              <p>
                {mapState ? stateName(mapState) : 'Your choice'} elects an at-large delegate, so there is no numbered
                district to pick on a map.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!mapState}
                onClick={() => confirm(mapState, null, 'map')}
              >
                Use my at-large seat
              </button>
            </div>
          ) : mapLoading ? (
            <LoadingState message="Loading the district boundaries…" />
          ) : mapError ? (
            <p className="form-error" role="alert">
              {mapError}{' '}
              <button type="button" className="link-more" onClick={() => mapState && loadMapState(mapState)}>
                Try again
              </button>
            </p>
          ) : mapGeometry ? (
            <DistrictMap
              key={mapState}
              features={mapGeometry}
              state={mapState}
              selected={choice?.method === 'map' && choice.state === mapState ? choice.district : null}
              onSelect={(district) => confirm(mapState, district, 'map')}
            />
          ) : null}
        </div>
      ) : null}

      {method === 'number' ? (
        <div className="onboard-number">
          <div className="onboard-number__controls">
            <SelectField
              id="district-state-number"
              label="State or territory"
              value={numState}
              onChange={(value) => loadNumberOptions(value)}
              options={[{ value: '', label: 'Choose a state or territory' }, ...STATE_OPTIONS]}
            />
            {numOptions && numOptions.length > 0 ? (
              <SelectField
                id="district-number"
                label="District number"
                value={numPick}
                onChange={(value) => {
                  setNumPick(value)
                  if (value) confirm(numState, Number(value), 'number')
                }}
                options={[
                  { value: '', label: 'Choose a district' },
                  ...numOptions.map((district) => ({ value: String(district), label: `District ${district}` })),
                ]}
              />
            ) : null}
          </div>
          {numLoading ? <LoadingState message="Loading the district list…" /> : null}
          {numError ? (
            <p className="form-error" role="alert">
              {numError}{' '}
              <button type="button" className="link-more" onClick={() => numState && loadNumberOptions(numState)}>
                Try again
              </button>
            </p>
          ) : null}
          {numOptions !== null && numOptions.length === 0 ? (
            <div className="onboard-atlarge">
              <p>
                {numState ? stateName(numState) : 'Your choice'} elects an at-large delegate, so there is no numbered
                district to pick.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!numState}
                onClick={() => confirm(numState, null, 'number')}
              >
                Use my at-large seat
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {choice ? (
        <div className="onboard-choice" role="status">
          <span className="onboard-choice__label">Your district:</span>{' '}
          <strong>
            {choice.state
              ? choice.district === null
                ? `${stateName(choice.state)} (At large)`
                : `${stateName(choice.state)} · District ${choice.district}`
              : '—'}
          </strong>{' '}
          <button type="button" className="link-more" onClick={() => setChoice(null)}>
            Change
          </button>
        </div>
      ) : null}

      <div className="onboard-step__actions">
        <button type="button" className="btn btn--primary btn--lg" disabled={!choice} onClick={() => onDone(choice!)}>
          Continue to topics
        </button>
      </div>
    </div>
  )
}
