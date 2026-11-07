// Minimal fetch wrapper for the FastAPI backend. Every path starts with /api so
// the Vite dev server can proxy it to the backend as one origin.

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// FastAPI error bodies carry a `detail` field, so surface it when it is a string.
function detailFrom(body: unknown): string | null {
  if (body !== null && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
  }
  return null
}

// Fetch a JSON response and throw an ApiError with a readable message on failure.
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError('The API is unreachable. Start the backend and try again.')
  }

  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    let message = detailFrom(body)
    if (!message && typeof body === 'string' && body.trim()) message = body.trim()
    if (!message) message = `The API responded with status ${response.status}.`
    if (message === 'Internal Server Error') {
      message =
        'The backend could not process the request. Check that the API is fully configured and see the backend logs for details.'
    }
    throw new ApiError(message, response.status)
  }
  return body as T
}
