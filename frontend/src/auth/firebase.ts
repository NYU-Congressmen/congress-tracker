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
    return getAuth(initializeApp(options))
  }).catch((error: unknown) => {
    authPromise = undefined
    throw error
  })
  return authPromise
}

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
      return 'There were too many attempts. Try again later.'
    default:
      return fallback
  }
}
