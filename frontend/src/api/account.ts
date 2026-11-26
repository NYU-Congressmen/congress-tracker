import type { User } from '@firebase/auth'
import { getAccountToken } from '../auth/accountToken'
import type { DistrictSelection, Profile } from '../profile/types'
import { request } from './client'

type ProfilePreferences = Pick<Profile, 'username' | 'district' | 'topics' | 'socials'>
type AccountProfile = Omit<Profile, 'firebase_uid'> & { saved: boolean }

// Load the signed-in account's profile.
export async function getAccountProfile(user: User): Promise<AccountProfile> {
  return request('/api/account/profile', {
    headers: { Authorization: `Bearer ${await getAccountToken(user)}` },
  })
}

// Save the changed fields without replacing other preferences.
export async function saveAccountProfile(
  user: User, patch: Partial<ProfilePreferences>, initialize = false,
): Promise<AccountProfile> {
  const { username, district, topics, socials } = patch
  return request(`/api/account/profile${initialize ? '?initialize=true' : ''}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccountToken(user)}` },
    body: JSON.stringify({ username, district, topics, socials }),
  })
}

// Resolve the street address and save its district on the verified account.
export async function saveAccountDistrict(
  user: User, address: string,
): Promise<Pick<DistrictSelection, 'state' | 'district'>> {
  return request('/api/account/district', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccountToken(user)}` },
    body: JSON.stringify({ address }),
  })
}

// Forget the account's address-matched district once the reader picks one on the map or by number.
export async function clearAccountDistrict(user: User): Promise<void> {
  await request('/api/account/district', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await getAccountToken(user)}` },
  })
}

// Return whether a district choice should replace the account's address match.
export function replacesAccountDistrict(district: DistrictSelection | null | undefined): boolean {
  return district != null && district.method !== 'address'
}
