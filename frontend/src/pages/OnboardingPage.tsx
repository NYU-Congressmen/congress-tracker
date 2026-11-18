import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AccountStep } from '../components/onboarding/AccountStep'
import { DistrictStep } from '../components/onboarding/DistrictStep'
import { SocialStep } from '../components/onboarding/SocialStep'
import { TopicsStep } from '../components/onboarding/TopicsStep'
import { useProfile } from '../profile/ProfileContext'
import type { DistrictSelection, SocialProfile } from '../profile/types'
import { districtHeading } from '../lib/districts'

type Step = 'account' | 'district' | 'topics' | 'social' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'account', label: 'Profile' },
  { id: 'district', label: 'District' },
  { id: 'topics', label: 'Topics' },
  { id: 'social', label: 'Social' },
]

// Set up the local profile and dashboard preferences.
export default function OnboardingPage() {
  const { profile, createProfile, selectProfile, leaveProfile, updateProfile } = useProfile()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(() => (profile ? 'district' : 'account'))
  const [username, setUsername] = useState(profile?.username ?? '')
  const [district, setDistrict] = useState<DistrictSelection | null>(profile?.district ?? null)
  const [topics, setTopics] = useState<number[]>(profile?.topics ?? [])
  const [socials, setSocials] = useState<SocialProfile[]>(profile?.socials ?? [])
  const [error, setError] = useState<string | null>(null)

  function finish(nextDistrict: DistrictSelection | null, nextTopics: number[], nextSocials: SocialProfile[]) {
    setError(null)
    try {
      const details = { district: nextDistrict, topics: nextTopics, socials: nextSocials }
      if (profile?.username === username) updateProfile(details)
      else createProfile(username, details)
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
          Choose your congressional district and the topics you follow.
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
            onCreate={(name) => {
              leaveProfile()
              setError(null)
              setUsername(name)
              setDistrict(null)
              setTopics([])
              setSocials([])
              setStep('district')
            }}
            onSelect={(name) => {
              try {
                const saved = selectProfile(name)
                setError(null)
                setUsername(name)
                setDistrict(saved.district)
                setTopics(saved.topics)
                setSocials(saved.socials)
                setStep('district')
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'The profile could not be opened.')
              }
            }}
          />
        ) : null}

        {step === 'district' ? (
          <DistrictStep
            initial={district}
            onDone={(selection) => {
              setDistrict(selection)
              setStep('topics')
            }}
          />
        ) : null}

        {step === 'topics' ? (
          <TopicsStep
            initial={topics}
            onDone={(nextTopics) => {
              setTopics(nextTopics)
              setStep('social')
            }}
          />
        ) : null}

        {step === 'social' ? (
          <SocialStep
            initial={socials}
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
              onClick={() => {
                setError(null)
                setStep(step === 'social' ? 'topics' : step === 'topics' ? 'district' : 'account')
              }}
            >
              Back
            </button>
          </div>
        ) : null}
      </div>

      {profile ? (
        <div className="onboard-signout">
          <span className="muted">Active profile is {profile.username}.</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              leaveProfile()
              setStep('account')
            }}
          >
            Switch profile
          </button>
        </div>
      ) : null}
    </div>
  )
}
