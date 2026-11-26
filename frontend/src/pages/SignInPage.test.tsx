import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecaptchaVerifier, signOut } from '@firebase/auth'
import { FirebaseError } from '@firebase/app'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionProvider } from '../auth/SessionProvider'
import { loadFirebaseAuth } from '../auth/firebase'
import SignInPage from './SignInPage'
import OnboardingPage from './OnboardingPage'
import { SiteHeader } from '../components/layout/SiteHeader'
import { ProfileProvider } from '../profile/ProfileContext'
import { createProfile } from '../profile/store'
import { mockApi } from '../test/fetchMock'

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

vi.mock('../auth/firebase', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/firebase')>(),
  loadFirebaseAuth: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.style.colorScheme = ''
})

test('uses one profile menu and returns to the signed-out header after sign-out', async () => {
  createProfile('maya', { firebase_uid: 'reviewer', district: null, topics: [], socials: [] })
  const user = { uid: 'reviewer', getIdToken: vi.fn().mockResolvedValue('verified-token') }
  const auth = {
    onAuthStateChanged: vi.fn((callback: (value: typeof user | null) => void) => {
      callback(user)
      vi.mocked(signOut).mockImplementation(async () => callback(null))
      return () => {}
    }),
  }
  vi.mocked(loadFirebaseAuth).mockResolvedValue(auth as unknown as Awaited<ReturnType<typeof loadFirebaseAuth>>)
  vi.stubGlobal('fetch', vi.fn(async (path: string) => path === '/api/account/profile'
    ? Response.json({
      username: 'maya', district: null, topics: [], socials: [], saved: true,
      created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
    })
    : new Response(null, { status: 204 })))

  render(
    <MemoryRouter>
      <SessionProvider>
        <ProfileProvider>
          <SiteHeader />
        </ProfileProvider>
      </SessionProvider>
    </MemoryRouter>,
  )

  const profile = await screen.findByLabelText('maya profile options')
  expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Get started' })).toBeNull()
  fireEvent.click(profile)
  expect(screen.getByRole('link', { name: 'Edit profile' }).getAttribute('href')).toBe('/profile')
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy()
  expect(screen.queryByLabelText('maya profile options')).toBeNull()
  // The account holds the profile, so the linked browser copy is gone.
  expect(localStorage.getItem('pull:accounts')).not.toContain('maya')
})

test('shows a Pull message for a phone request rejected by Firebase', async () => {
  const auth = { onAuthStateChanged: (callback: (value: null) => void) => {
    callback(null)
    return () => {}
  } }
  vi.mocked(loadFirebaseAuth).mockResolvedValue(auth as unknown as Awaited<ReturnType<typeof loadFirebaseAuth>>)
  mocks.requestCode.mockRejectedValueOnce(new FirebaseError('auth/internal-error', 'SDK diagnostic'))

  render(
    <MemoryRouter>
      <SessionProvider><SignInPage /></SessionProvider>
    </MemoryRouter>,
  )

  fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '6505550102' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request code' }))
  const message = await screen.findByRole('alert')
  expect(message.textContent).toBe('We couldn’t request a code. Try again.')
})

test('requires restarting onboarding after three rejected codes across resends', async () => {
  const auth = { onAuthStateChanged: (callback: (value: null) => void) => {
    callback(null)
    return () => {}
  } }
  vi.mocked(loadFirebaseAuth).mockResolvedValue(auth as unknown as Awaited<ReturnType<typeof loadFirebaseAuth>>)
  mocks.requestCode.mockResolvedValue({ confirm: mocks.verifyCode })
  mocks.verifyCode.mockRejectedValue(new FirebaseError('auth/invalid-verification-code', 'Invalid code'))
  mockApi([{ match: '/api/issues', body: [] }])

  render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <SessionProvider><ProfileProvider><OnboardingPage /></ProfileProvider></SessionProvider>
    </MemoryRouter>,
  )

  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'maya' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to your district' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Pick the number' }))
  fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'DC' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use my at-large seat' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to social profiles' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to phone verification' }))

  fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '6505550102' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request code' }))
  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Request a new code' }))
  fireEvent.click(screen.getByRole('button', { name: 'Request code' }))
  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }))

  const restart = await screen.findByRole('button', { name: 'Restart setup' })
  expect(mocks.verifyCode).toHaveBeenCalledTimes(3)
  expect(screen.queryByRole('button', { name: 'Verify code' })).toBeNull()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Profile' }).disabled).toBe(true)
  fireEvent.click(restart)
  expect(screen.getByLabelText<HTMLInputElement>('Profile name').value).toBe('')
})

test.each([
  { theme: 'light', input: '+1 650-555-0102' },
  { theme: 'dark', input: '16505550102' },
  { theme: 'light', input: '6505550102' },
])('verifies $input with the $theme theme', async ({ theme, input }) => {
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

  const phone = await screen.findByLabelText('Phone number')
  expect(document.title).toBe('Phone sign-in | Pull')
  fireEvent.change(phone, { target: { value: input } })
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
