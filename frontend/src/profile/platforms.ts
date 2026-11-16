// The social platforms a person can connect. Add a platform here and it
// appears in the onboarding step, the Social page and the profile summary.

export interface Platform {
  id: string
  name: string
  // The handle format a reader should type, shown as the input placeholder.
  handleHint: string
}

export const PLATFORMS: Platform[] = [
  { id: 'bluesky', name: 'Bluesky', handleHint: 'you.bsky.social' },
  { id: 'x', name: 'X (Twitter)', handleHint: '@handle' },
  { id: 'mastodon', name: 'Mastodon', handleHint: '@you@mastodon.social' },
  { id: 'threads', name: 'Threads', handleHint: '@handle' },
  { id: 'instagram', name: 'Instagram', handleHint: '@handle' },
  { id: 'tiktok', name: 'TikTok', handleHint: '@handle' },
  { id: 'facebook', name: 'Facebook', handleHint: 'facebook.com/profile' },
  { id: 'linkedin', name: 'LinkedIn', handleHint: 'linkedin.com/in/handle' },
]

// A stable order for showing a person's handles, and the display name of each.
export function platformName(id: string): string {
  return PLATFORMS.find((platform) => platform.id === id)?.name ?? id
}
