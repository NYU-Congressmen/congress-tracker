import { vi } from 'vitest'

export interface ApiRoute {
  // Matches when the requested URL (path plus query) contains this string.
  // List more specific routes first so they win over broader prefixes.
  match: string
  body: unknown
  status?: number
}

// Stub global fetch with canned API responses, routed by URL fragment.
export function mockApi(routes: ApiRoute[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const route = routes.find((candidate) => url.includes(candidate.match))
    if (!route) {
      return new Response(JSON.stringify({ detail: `No mock registered for ${url}` }), { status: 500 })
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
