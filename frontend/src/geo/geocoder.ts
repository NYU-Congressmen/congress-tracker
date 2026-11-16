// Address lookup through OpenStreetMap's Nominatim service, which allows
// browser calls and needs no API key. The Census geocoder would work too, but
// it does not send CORS headers, so a static frontend cannot call it.

// The state a US address sits in, as a postal code.
const STATE_NAMES: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'American Samoa': 'AS', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Guam': 'GU', 'Hawaii': 'HI',
  'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
  'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT',
  'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Northern Mariana Islands': 'MP',
  'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Puerto Rico': 'PR',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
  'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA',
  'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'U.S. Virgin Islands': 'VI', 'United States Virgin Islands': 'VI', 'Federated States of Micronesia': 'FM',
  'Marshall Islands': 'MH',
}

export interface GeocodedAddress {
  lat: number
  lng: number
  label: string
  // The US state or territory postal code, when the result carries one.
  state: string | null
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export class GeocoderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeocoderError'
  }
}

// Turn a free-form US address into coordinates, or null when nothing matched.
export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const query = new URLSearchParams({
    q: address,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
  })
  let response: Response
  try {
    response = await fetch(`${NOMINATIM_URL}?${query.toString()}`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new GeocoderError('The address lookup service could not be reached. Check your connection and try again.')
  }
  if (!response.ok) {
    throw new GeocoderError('The address lookup service is unavailable right now. Try again, or pick the district on the map.')
  }
  const results: Array<{
    lat: string
    lon: string
    display_name: string
    address?: { state?: string }
  }> = await response.json()
  const best = results[0]
  if (!best) return null
  return {
    lat: Number(best.lat),
    lng: Number(best.lon),
    label: best.display_name,
    state: STATE_NAMES[best.address?.state ?? ''] ?? null,
  }
}
