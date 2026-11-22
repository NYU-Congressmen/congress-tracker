import { FirebaseError, initializeApp } from '@firebase/app'
import type { FirebaseOptions } from '@firebase/app'
import type { Auth } from '@firebase/auth'

let authPromise: Promise<Auth> | undefined

async function firebaseOptions(): Promise<FirebaseOptions | null> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  if (apiKey && authDomain && projectId) return { apiKey, authDomain, projectId }
  if (!import.meta.env.PROD) return null

  // Hosting serves the public project config on the same origin as the built app.
  const response = await fetch('/__/firebase/init.json')
  if (!response.ok) return null
  return response.json()
}

export function loadFirebaseAuth(): Promise<Auth> {
  authPromise ??= firebaseOptions().then(async (options) => {
    if (!options?.apiKey || !options.authDomain || !options.projectId) {
      throw new Error('Phone sign-in is unavailable.')
    }
    const { getAuth } = await import('@firebase/auth')
    const auth = getAuth(initializeApp(options))
    // Firebase accepts only configured fictional numbers in this preview mode.
    if (import.meta.env.DEV && window.location.hostname === 'localhost'
      && import.meta.env.VITE_FIREBASE_PHONE_TEST_MODE === 'true') {
      auth.settings.appVerificationDisabledForTesting = true
    }
    return auth
  }).catch((error: unknown) => {
    authPromise = undefined
    throw error
  })
  return authPromise
}

// Translate a phone sign-in failure into a message the reader can act on.
export function phoneSignInMessage(error: unknown, fallback: string): string {
  if (!(error instanceof FirebaseError)) return fallback
  switch (error.code) {
    case 'auth/invalid-phone-number':
      return 'Enter a phone number with its country code.'
    case 'auth/invalid-verification-code':
      return 'Check the verification code and try again.'
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'This code expired. Request a new one.'
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'There were too many attempts. Try again later.'
    case 'auth/unauthorized-domain':
      return 'Phone verification is unavailable at this address.'
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
      return 'The browser challenge could not be verified. Request a new code to try again.'
    case 'auth/network-request-failed':
      return 'Check your connection and try again.'
    case 'auth/operation-not-allowed':
      return /region enabled/i.test(error.message)
        ? 'Phone verification is unavailable for numbers in this region.'
        : 'Phone verification is unavailable right now. Try again later.'
    default:
      return fallback
  }
}
