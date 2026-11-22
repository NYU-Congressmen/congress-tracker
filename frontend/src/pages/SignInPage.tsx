import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSession } from '../auth/SessionContext'
import PhoneAuthForm from '../components/auth/PhoneAuthForm'
import { PageBand } from '../components/layout/PageBand'

export default function SignInPage() {
  const { user, loading } = useSession()
  const [params] = useSearchParams()
  const returnToOnboarding = params.get('next') === 'onboarding'
  const returnToProfile = params.get('next') === 'profile'

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Phone sign-in | Pull'
    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <>
      <PageBand labelledBy="sign-in-title">
        <h1 id="sign-in-title" className="page-title">Phone sign-in</h1>
      </PageBand>
      <div className="container page-body">
        <section className="panel sign-in-panel" aria-label="Phone sign-in">
          {!loading && user ? (
            <div className="onboard-form">
              <p role="status">You’re signed in.</p>
              <Link
                to={returnToOnboarding ? '/onboarding?step=district' : returnToProfile ? '/profile' : '/social'}
                className="btn btn--primary"
              >
                {returnToOnboarding ? 'Continue to your district' : returnToProfile ? 'Continue to your profile' : 'Go to discussions'}
              </Link>
            </div>
          ) : <PhoneAuthForm />}
        </section>
      </div>
    </>
  )
}
