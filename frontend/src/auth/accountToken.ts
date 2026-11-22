import type { User } from '@firebase/auth'
import { ApiError } from '../api/client'

// Return a token for an account request or prompt the reader to sign in again.
export async function getAccountToken(user: User): Promise<string> {
  try {
    return await user.getIdToken()
  } catch {
    throw new ApiError('Your session could not be verified. Sign in again and retry.', 401)
  }
}
