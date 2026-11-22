import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import AboutPage from './AboutPage'
import { mockApi } from '../test/fetchMock'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AboutPage', () => {
  test('reports the API health once the check returns', async () => {
    mockApi([
      {
        match: '/api/health',
        body: { status: 'ok', database_configured: false, congress_api_configured: true },
      },
    ])

    render(<AboutPage />)

    expect(await screen.findByText('ok')).toBeTruthy()
    expect(screen.getByText('not configured')).toBeTruthy()
    expect(screen.getByText('configured')).toBeTruthy()
  })

  test('offers a retry when the API is unreachable', async () => {
    mockApi([{ match: '/api/health', body: { detail: 'server error' }, status: 503 }])

    render(<AboutPage />)

    expect(await screen.findByText('The API is unreachable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
