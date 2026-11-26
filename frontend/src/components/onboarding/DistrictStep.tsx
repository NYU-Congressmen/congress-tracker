import { useEffect, useState } from 'react'
import { districtsInState, stateDistrictGeometry } from '../../geo/census'
import { simplifyFeatureCollection } from '../../geo/simplify'
import type { FeatureCollection } from '../../geo/simplify'
import { STATE_OPTIONS } from '../../lib/constants'
import { districtHeading, isAtLargeState, stateName } from '../../lib/districts'
import { useApi } from '../../hooks/useApi'
import type { DistrictSelection } from '../../profile/types'
import { DistrictMap } from './DistrictMap'
import { AddressDistrict } from './AddressDistrict'
import { SelectField } from '../ui/Fields'
import { LoadingState } from '../ui/LoadingState'
import { StepActions } from './StepActions'

type Method = DistrictSelection['method']

interface DistrictStepProps {
  initial: DistrictSelection | null
  preferAddress: boolean
  deferAddressSave?: boolean
  nextLabel: string
  onBack?: () => void
  onDone: (selection: DistrictSelection, addressToSave?: string) => void
}

// The state's district boundaries, simplified once and kept in memory, so
// revisiting the step does not re-download tens of megabytes.
const geometryCache = new Map<string, Promise<FeatureCollection>>()

// The whole-state point budget for the map: dense enough that every boundary
// stays smooth at any zoom (a deviation-based decimation of this data
// zig-zags), sparse enough that the SVG stays a few hundred kilobytes at
// most. Sharp corners are kept on top of the budget, so the total is a
// little higher for states with many hard angles.
const DIST_MAP_POINTS = 4000

// Share the in-flight boundary request with the map tab and retry failed requests.
function loadMap(state: string): Promise<FeatureCollection> {
  const cached = geometryCache.get(state)
  if (cached) return cached
  const geometry = stateDistrictGeometry(state)
    .then((features) => simplifyFeatureCollection(features, DIST_MAP_POINTS, state === 'AK'))
    .catch((error: unknown) => {
      geometryCache.delete(state)
      throw error
    })
  geometryCache.set(state, geometry)
  return geometry
}

// Choose a congressional district by address, map or district number.
export function DistrictStep({ initial, preferAddress, deferAddressSave, nextLabel, onBack, onDone }: DistrictStepProps) {
  const [method, setMethod] = useState<Method>(preferAddress ? 'address' : initial?.method ?? 'address')
  const [choice, setChoice] = useState<DistrictSelection | null>(initial?.method === 'address' ? null : initial)

  const [mapState, setMapState] = useState(initial?.state ?? '')
  const [numState, setNumState] = useState(initial?.state ?? '')
  const [numPick, setNumPick] = useState(initial ? String(initial.district ?? 0) : '')

  const knownState = initial?.state
  useEffect(() => {
    if (knownState && !isAtLargeState(knownState)) void loadMap(knownState).catch(() => {})
  }, [knownState])

  const map = useApi(
    () => method === 'map' && mapState && !isAtLargeState(mapState)
      ? loadMap(mapState) : Promise.resolve(null),
    [method, mapState],
  )

  const numbers = useApi(
    () => method === 'number' && numState && !isAtLargeState(numState)
      ? districtsInState(numState)
      : Promise.resolve([]),
    [method, numState],
  )
  const numOptions = numbers.loading || numbers.error ? [] : numbers.data ?? []

  function confirm(state: string, district: number | null, via: Method) {
    setChoice({ state, district: district === 0 ? null : district, method: via })
  }

  const methodTabs: { id: Method; label: string }[] = [
    { id: 'address', label: 'Find by address' },
    { id: 'map', label: 'Pick it on the map' },
    { id: 'number', label: 'Pick the number' },
  ]

  return (
    <div className="onboard-step onboard-district">
      <h2>Congressional district</h2>
      <div className="onboard-step__modes" role="tablist" aria-label="District lookup methods">
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
        <AddressDistrict
          initial={initial?.method === 'address' ? initial : null}
          deferSave={deferAddressSave}
          nextLabel={nextLabel}
          onBack={onBack}
          onDone={onDone}
        />
      ) : null}

      {method === 'map' ? (
        <div className="onboard-map">
          <div className="onboard-map__controls">
            <SelectField
              id="district-state-map"
              label="State or territory"
              value={mapState}
              onChange={(value) => {
                setMapState(value)
                setChoice(null)
              }}
              options={[{ value: '', label: 'Choose a state or territory' }, ...STATE_OPTIONS]}
            />
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
          ) : mapState && map.loading ? (
            <LoadingState message="Loading the district boundaries…" />
          ) : map.error ? (
            <p className="form-error" role="alert">
              {map.error.message}{' '}
              <button type="button" className="link-more" onClick={map.refetch}>
                Try again
              </button>
            </p>
          ) : map.data ? (
            <DistrictMap
              key={mapState}
              features={map.data}
              state={mapState}
              selected={choice?.method === 'map' && choice.state === mapState ? (choice.district ?? 0) : null}
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
              onChange={(value) => {
                setChoice(null)
                setNumState(value)
                setNumPick('')
              }}
              options={[{ value: '', label: 'Choose a state or territory' }, ...STATE_OPTIONS]}
            />
            {numOptions.length > 0 ? (
              <SelectField
                id="district-number"
                label="District number"
                value={numPick}
                onChange={(value) => {
                  setNumPick(value)
                  if (value) confirm(numState, Number(value), 'number')
                  else setChoice(null)
                }}
                options={[
                  { value: '', label: 'Choose a district' },
                  ...numOptions.map((district) => ({ value: String(district), label: district === 0 ? 'At-large district' : `District ${district}` })),
                ]}
              />
            ) : null}
          </div>
          {numState && numbers.loading && !isAtLargeState(numState) ? <LoadingState message="Loading the district list…" /> : null}
          {numbers.error ? (
            <p className="form-error" role="alert">
              {numbers.error.message}{' '}
              <button type="button" className="link-more" onClick={numbers.refetch}>
                Try again
              </button>
            </p>
          ) : null}
          {isAtLargeState(numState) ? (
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

      {method !== 'address' && choice ? (
        <div className="onboard-choice" role="status">
          <span className="onboard-choice__label">Your district:</span>{' '}
          <strong>{districtHeading(choice.state, choice.district)}</strong>
        </div>
      ) : null}

      {method !== 'address' ? (
        <StepActions onBack={onBack}>
          <button type="button" className="btn btn--primary" disabled={!choice} onClick={() => choice && onDone(choice)}>
            {nextLabel}
          </button>
        </StepActions>
      ) : null}
    </div>
  )
}
