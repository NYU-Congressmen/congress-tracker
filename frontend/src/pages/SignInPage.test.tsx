import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecaptchaVerifier } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionProvider } from '../auth/SessionProvider'
import { loadFirebaseAuth } from '../auth/firebase'
import SignInPage from './SignInPage'

const mocks = vi.hoisted(() => ({
  verifyCode: vi.fn(),
  requestCode: vi.fn(),
  clearChallenge: vi.fn(),
}))

vi.mock('@firebase/auth', () => ({
  RecaptchaVerifier: vi.fn(function () {
    return { clear: mocks.clearChallenge }
  }),
  signInWithPhoneNumber: mocks.requestCode,
  signOut: vi.fn(),
}))

vi.mock('../auth/firebase', () => ({
  loadFirebaseAuth: vi.fn(),
  phoneSignInMessage: (_error: unknown, fallback: string) => fallback,
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.style.colorScheme = ''
})

test.each(['light', 'dark'])('verifies a phone account with the %s theme', async (theme) => {
  document.documentElement.style.colorScheme = theme
  const user = { uid: 'reviewer', getIdToken: vi.fn().mockResolvedValue('verified-token') }
  const auth = {
    onAuthStateChanged: vi.fn((callback: (value: typeof user | null) => void) => {
      callback(null)
      mocks.verifyCode.mockImplementation(async () => callback(user))
      return () => {}
    }),
  }
  vi.mocked(loadFirebaseAuth).mockResolvedValue(auth as unknown as Awaited<ReturnType<typeof loadFirebaseAuth>>)
  mocks.requestCode.mockResolvedValue({ confirm: mocks.verifyCode })
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)

  render(
    <MemoryRouter>
      <SessionProvider>
        <SignInPage />
      </SessionProvider>
    </MemoryRouter>,
  )

  const phone = await screen.findByLabelText('Phone number with country code')
  expect(document.title).toBe('Phone sign-in | Pull')
  fireEvent.change(phone, { target: { value: '+1 650-555-0102' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request code' }))

  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '296481' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))

  await waitFor(() => expect(screen.getByText('You’re signed in.')).toBeTruthy())
  expect(RecaptchaVerifier).toHaveBeenCalledWith(auth, expect.any(HTMLDivElement), {
    size: 'invisible', theme,
  })
  expect(mocks.requestCode).toHaveBeenCalledWith(auth, '+16505550102', expect.anything())
  expect(mocks.verifyCode).toHaveBeenCalledWith('296481')
  expect(fetchMock).toHaveBeenCalledWith('/api/account', expect.objectContaining({
    method: 'PUT',
    headers: { Authorization: 'Bearer verified-token' },
  }))
})
