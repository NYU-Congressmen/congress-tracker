// Use 119th Congress boundaries to match the member directory.

import { AT_LARGE_STATES } from '../lib/districts'
import type { FeatureCollection } from './simplify'

const LAYER =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2025/MapServer/54'

export class CensusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CensusError'
  }
}

function stateCode(state: string): string {
  return state.trim().toUpperCase().slice(0, 2)
}

// The Census service reports states by FIPS code; the rest of the app uses
// postal codes, so translate the way back.
const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '73': 'MH',
  '78': 'VI', '58': 'FM',
}

// The FIPS prefix of a state's district GEOIDs; territories use their own codes.
function geoPrefix(state: string): string {
  const code = stateCode(state)
  const entry = Object.entries(FIPS_TO_STATE).find(([, postal]) => postal === code)
  return entry ? entry[0] : code
}

// Which districts exist in a state, from the 119th Congress boundaries.
// Returns [] for a territory or the District of Columbia: their delegate sits
// at large, so there is no numbered district to pick.
export async function districtsInState(state: string): Promise<number[]> {
  const prefix = geoPrefix(state)
  if (AT_LARGE_STATES.has(stateCode(state))) return []
  const query = new URLSearchParams({
    where: `GEOID LIKE '${prefix}%'`,
    outFields: 'CD119',
    returnGeometry: 'false',
    f: 'json',
  })
  let response: Response
  try {
    response = await fetch(`${LAYER}/query?${query.toString()}`)
  } catch {
    throw new CensusError('The district boundaries could not be loaded. Check your connection and try again.')
  }
  if (!response.ok) {
    throw new CensusError('The district boundaries could not be loaded. Try again in a moment.')
  }
  const body: { features?: Array<{ attributes?: { CD119?: string } }> } = await response.json()
  const numbers = new Set<number>()
  for (const feature of body.features ?? []) {
    const value = Number(feature.attributes?.CD119)
    if (Number.isInteger(value) && value >= 0) numbers.add(value)
  }
  return [...numbers].sort((a, b) => a - b)
}

// A state's district polygons, for drawing the selection map.
export async function stateDistrictGeometry(state: string): Promise<FeatureCollection> {
  const prefix = geoPrefix(state)
  const query = new URLSearchParams({
    where: `GEOID LIKE '${prefix}%'`,
    outFields: 'CD119',
    outSR: '4326',
    f: 'geojson',
  })
  let response: Response
  try {
    response = await fetch(`${LAYER}/query?${query.toString()}`)
  } catch {
    throw new CensusError('The district map could not be loaded. Check your connection and try again.')
  }
  if (!response.ok) {
    throw new CensusError('The district map could not be loaded. Try again in a moment.')
  }
  const fc = (await response.json()) as FeatureCollection
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new CensusError('The district map came back in an unexpected shape.')
  }
  return fc
}
