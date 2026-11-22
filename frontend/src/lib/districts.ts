import type { Member } from '../api/members'
import { STATE_OPTIONS } from './constants'

// The District of Columbia and the territories send a delegate who sits at
// large, so a person there has no numbered district.
export const AT_LARGE_STATES = new Set(['DC', 'AS', 'GU', 'MP', 'PR', 'VI', 'FM', 'MH'])

export function stateName(code: string): string {
  const found = STATE_OPTIONS.find((state) => state.value.toUpperCase() === code.toUpperCase())
  return found?.label ?? code.toUpperCase()
}

export function isAtLargeState(state: string): boolean {
  return AT_LARGE_STATES.has(state.toUpperCase())
}

// "California · District 10", "Wyoming (At large)", "Washington, D.C. (At large)"
export function districtHeading(state: string, district: number | null): string {
  const name = stateName(state)
  if (district === null || isAtLargeState(state)) return `${name} (At large)`
  return `${name} · District ${district}`
}

// The person's representatives from a directory: the House member for the
// district (where the seat is numbered) and both senators for the state.
export function representativesForDistrict(
  members: Member[],
  state: string,
  district: number | null,
): { house: Member[]; senate: Member[] } {
  const inState = members.filter((member) => (member.state ?? '').toUpperCase() === state.toUpperCase())
  const house = inState.filter(
    (member) =>
      member.chamber === 'House' &&
      (district === null ? member.district === null : member.district === district),
  )
  const senate = inState.filter((member) => member.chamber === 'Senate')
  return { house, senate }
}
