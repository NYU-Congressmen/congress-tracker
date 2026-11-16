import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AccountStep } from '../components/onboarding/AccountStep'
import { DistrictStep } from '../components/onboarding/DistrictStep'
import { SocialStep } from '../components/onboarding/SocialStep'
import { TopicsStep } from '../components/onboarding/TopicsStep'
import { useProfile } from '../profile/ProfileContext'
import { isUsernameTaken } from '../profile/store'
import { platformName } from '../profile/platforms'
import type { DistrictSelection, SocialProfile } from '../profile/types'
import { districtHeading } from '../lib/districts'

type Step = 'account' | 'district' | 'topics' | 'social' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'district', label: 'District' },
  { id: 'topics', label: 'Topics' },
  { id: 'social', label: 'Social' },
]

// The setup flow: a username and password, the person's district (by address,
// map or number), the topics to follow, and the social profiles to connect.
// Each step is its own component, so a later release can add steps without
// touching the wizard.
export default function OnboardingPage() {
  const { profile, signUp, signIn, signOut, updateProfile } = useProfile()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(() => (profile ? 'district' : 'account'))
  const [username, setUsername] = useState(profile?.username ?? '')
  const [password, setPassword] = useState<string | null>(null)
  const [district, setDistrict] = useState<DistrictSelection | null>(profile?.district ?? null)
  const [topics, setTopics] = useState<number[]>(profile?.topics ?? [])
  const [socials, setSocials] = useState<SocialProfile[]>(profile?.socials ?? [])
  const [error, setError] = useState<string | null>(null)

  function finish(nextDistrict: DistrictSelection | null, nextTopics: number[], nextSocials: SocialProfile[]) {
    setError(null)
    try {
      if (password !== null) {
        if (isUsernameTaken(username)) {
          // The name is on this device already. A matching password means it
          // is the same person, so carry the new setup onto their account
          // instead of failing the finish; a different password throws a
          // readable error from signIn.
          signIn(username, password)
          updateProfile({ district: nextDistrict, topics: nextTopics, socials: nextSocials })
        } else {
          signUp(username, password, { district: nextDistrict, topics: nextTopics, socials: nextSocials })
        }
      } else {
        updateProfile({ district: nextDistrict, topics: nextTopics, socials: nextSocials })
      }
      setStep('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong while saving your profile.')
    }
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step)

  return (
    <div className="container page onboard">
      <header className="page__header">
        <h1>{profile ? 'Edit your profile' : 'Set up your profile'}</h1>
        <p className="page__lede">
          Four short steps: an account, your congressional district, the topics you follow, and the social profiles
          you post from.
        </p>
      </header>

      {step !== 'done' ? (
        <ol className="onboard-steps" aria-label="Setup steps">
          {STEPS.map((item, index) => (
            <li
              key={item.id}
              className={`onboard-steps__item${index === stepIndex ? ' is-current' : ''}${index < stepIndex ? ' is-done' : ''}`}
            >
              <span className="onboard-steps__number" aria-hidden="true">
                {index < stepIndex ? '✓' : index + 1}
              </span>
              {item.label}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="panel onboard__panel">
        {step === 'account' ? (
          <AccountStep
            onDone={(name, secret) => {
              if (secret === null) {
                // Signed in: carry the existing profile forward.
                setUsername(name)
                setPassword(null)
              } else {
                setUsername(name)
                setPassword(secret)
              }
              setStep('district')
            }}
          />
        ) : null}

        {step === 'district' ? (
          <DistrictStep
            initial={profile?.district ?? null}
            onDone={(selection) => {
              setDistrict(selection)
              setStep('topics')
            }}
          />
        ) : null}

        {step === 'topics' ? (
          <TopicsStep
            initial={profile?.topics ?? []}
            onDone={(nextTopics) => {
              setTopics(nextTopics)
              setStep('social')
            }}
          />
        ) : null}

        {step === 'social' ? (
          <SocialStep
            initial={profile?.socials ?? []}
            onDone={(nextSocials) => {
              setSocials(nextSocials)
              finish(district, topics, nextSocials)
            }}
          />
        ) : null}

        {step === 'done' ? (
          <div className="onboard-done">
            <h2>All set, {username || 'there'}</h2>
            <p>
              {district
                ? `Your dashboard now follows ${districtHeading(district.state, district.district)}`
                : 'Your dashboard is ready'}
              {topics.length > 0 ? ' and the newest bills on your topics' : ''}.
              {socials.length > 0 ? ` Your posts will be signed by ${socials.map((social) => platformName(social.platform)).join(', ')}.` : ''}
            </p>
            <div className="onboard-done__actions">
              <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/')}>
                Go to my dashboard
              </button>
              <Link to="/social" className="btn btn--secondary">
                Open the Social page
              </Link>
            </div>
          </div>
        ) : null}

        {error && step !== 'done' ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {step !== 'done' && step !== 'account' ? (
          <div className="onboard-back">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setStep(step === 'social' ? 'topics' : step === 'topics' ? 'district' : 'account')}
            >
              Back
            </button>
          </div>
        ) : null}
      </div>

      {profile ? (
        <div className="onboard-signout">
          <span className="muted">Signed in as {profile.username}.</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              signOut()
              setStep('account')
              setPassword(null)
            }}
          >
            Sign in as someone else
          </button>
        </div>
      ) : null}
    </div>
  )
}
