// The shape of a person's profile on this device. The backend will own
// accounts once sign-in is live; until then the profile lives in localStorage
// and the onboarding flow fills it in.

// A connected social media account, e.g. { platform: 'bluesky', handle: 'maya.bsky.social' }
export interface SocialProfile {
  platform: string
  handle: string
}

// Where the person lives, for matching their representatives and bills.
// `district` is null only for at-large delegates (the District of Columbia
// and the territories); single-district states like Wyoming keep district 1,
// matching how the member data numbers them.
export interface DistrictSelection {
  state: string
  district: number | null
  // How the person picked, kept for a future "improve your district" step.
  method: 'address' | 'map' | 'number'
}

export interface Profile {
  username: string
  district: DistrictSelection | null
  // The issue ids (from /api/issues) the person follows, chosen in
  // onboarding. The dashboard lists the newest bills on those topics.
  topics: number[]
  socials: SocialProfile[]
  created_at: string
  updated_at: string
}

// The stored form adds the password; the profile handed to pages never does.
export interface Account extends Profile {
  password: string
}
