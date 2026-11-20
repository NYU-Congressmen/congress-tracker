// Define the profile data stored in the browser.

// A connected social media account, e.g. { platform: 'bluesky', handle: 'maya.bsky.social' }
export interface SocialProfile {
  platform: string
  handle: string
}

// Where the person lives, for matching their representatives and bills.
// Store at-large seats with a null district to match the member directory.
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
