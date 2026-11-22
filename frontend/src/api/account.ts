import type { User } from '@firebase/auth'
import { getAccountToken } from '../auth/accountToken'
import type { DistrictSelection } from '../profile/types'
import { request } from './client'

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
