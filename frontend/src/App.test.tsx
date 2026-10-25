import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('shows the API status once the health check returns', async () => {
  const body = { status: 'ok', database_configured: false, congress_api_configured: true }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))

  render(<App />)

  expect(await screen.findByText('API status: ok')).toBeTruthy()
  expect(screen.getByText('Congress.gov key configured: yes')).toBeTruthy()
})
