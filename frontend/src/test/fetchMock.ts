import { vi } from 'vitest'
import type { Profile } from '../profile/types'

export interface ApiRoute {
  // Matches when the requested URL (path plus query) contains this string.
  // List more specific routes first so they win over broader prefixes.
  match: string
  body?: unknown
  respond?: (init?: RequestInit) => unknown
  status?: number
}

// Stub global fetch with canned API responses, routed by URL fragment.
export function mockApi(routes: ApiRoute[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const route = routes.find((candidate) => url.includes(candidate.match))
    if (!route) {
      return new Response(JSON.stringify({ detail: `No mock registered for ${url}` }), { status: 500 })
    }
    return new Response(JSON.stringify(route.respond ? route.respond(init) : route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Respond to reads and edits of one signed-in test account.
export function mockAccountProfile(initial: Partial<Profile> = {}, saved = true) {
  const profile = {
    username: 'Profile', district: null, topics: [], socials: [],
    created_at: '2026-01-01', updated_at: '2026-01-01', ...initial, saved,
  }
  const route: ApiRoute = {
    match: '/api/account/profile',
    respond: (init) => {
      if (init?.method === 'PATCH') Object.assign(profile, JSON.parse(String(init.body)), { saved: true })
      return profile
    },
  }
  return { route, profile }
}
