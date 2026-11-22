import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AccountStep } from '../components/onboarding/AccountStep'
import { DistrictStep } from '../components/onboarding/DistrictStep'
import { SocialStep } from '../components/onboarding/SocialStep'
import { TopicsStep } from '../components/onboarding/TopicsStep'
import { PageBand } from '../components/layout/PageBand'
import { StepActions } from '../components/onboarding/StepActions'
import { clearAccountDistrict, replacesAccountDistrict, saveAccountDistrict } from '../api/account'
import { useSession } from '../auth/SessionContext'
import { useProfile } from '../profile/ProfileContext'
import type { DistrictSelection, SocialProfile } from '../profile/types'
import { ProfileSaved } from '../components/onboarding/ProfileSaved'
import { ProfileSections } from '../components/onboarding/ProfileSections'

const PhoneAuthForm = lazy(() => import('../components/auth/PhoneAuthForm'))
const MAX_FAILED_ATTEMPTS = 3

const STEP_LABELS = { account: 'Profile', district: 'District', topics: 'Topics', social: 'Social', verify: 'Phone verification' }
type SetupStep = keyof typeof STEP_LABELS

// Set up the local profile and dashboard preferences.
export default function OnboardingPage() {
  const { profile, createProfile, selectProfile, leaveProfile, updateProfile } = useProfile()
  const { user, loading } = useSession()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const resumeDistrict = params.get('step') === 'district'
  const [username, setUsername] = useState(profile?.username ?? '')
  const [districtFirst, setDistrictFirst] = useState(() => resumeDistrict && !profile)
  const steps: SetupStep[] = districtFirst
    ? ['district', 'account', 'topics', 'social', 'verify']
    : ['account', 'district', 'topics', 'social', 'verify']
  const [step, setStep] = useState<SetupStep | 'done'>(() => resumeDistrict || (user && profile) ? 'district' : 'account')
  const [district, setDistrict] = useState<DistrictSelection | null>(profile?.district ?? null)
  const [addressToSave, setAddressToSave] = useState<string>()
  const [topics, setTopics] = useState<number[]>(profile?.topics ?? [])
  const [socials, setSocials] = useState<SocialProfile[]>(profile?.socials ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [codeFailures, setCodeFailures] = useState(0)
  const [saveFailures, setSaveFailures] = useState(0)
  const saveAttempted = useRef(false)
  const restartRequired = codeFailures >= MAX_FAILED_ATTEMPTS || saveFailures >= MAX_FAILED_ATTEMPTS

  // Save the browser profile after the API registers the verified Firebase user.
  const saveProfile = useCallback(async () => {
    if (!user || loading || restartRequired || saveAttempted.current) return
    saveAttempted.current = true
    setError(null)
    setSaving(true)
    try {
      let verifiedDistrict = district
      if (district?.method === 'address' && addressToSave) {
        const match = await saveAccountDistrict(user, addressToSave)
        verifiedDistrict = { ...match, method: 'address' }
        setDistrict(verifiedDistrict)
        setAddressToSave(undefined)
      }
      if (replacesAccountDistrict(verifiedDistrict)) await clearAccountDistrict(user)
      const details = { firebase_uid: user.uid, district: verifiedDistrict, topics, socials }
      if (profile?.username === username) updateProfile(details)
      else createProfile(username, details)
      setStep('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong while saving your profile.')
      setSaveFailures((count) => count + 1)
    } finally {
      setSaving(false)
    }
  }, [addressToSave, createProfile, district, loading, profile, restartRequired, socials, topics, updateProfile, user, username])

  useEffect(() => {
    if (step !== 'verify') return
    let active = true
    queueMicrotask(() => {
      if (active) void saveProfile()
    })
    return () => { active = false }
  }, [saveProfile, step])

  const stepIndex = steps.findIndex((item) => item === step)
  const afterProfile = districtFirst ? 'topics' : 'district'
  const afterDistrict = districtFirst ? 'account' : 'topics'

  // Reopen an earlier step while keeping the completed choices.
  function openStep(target: SetupStep) {
    setError(null)
    setStep(target)
  }

  // Start again from the saved profile and clear the previous setup draft.
  function restartSetup() {
    setUsername(profile?.username ?? '')
    setDistrict(profile?.district ?? null)
    setAddressToSave(undefined)
    setTopics(profile?.topics ?? [])
    setSocials(profile?.socials ?? [])
    setDistrictFirst(false)
    setCodeFailures(0)
    setSaveFailures(0)
    saveAttempted.current = false
    openStep('account')
    navigate('/onboarding', { replace: true })
  }

  const goBack = stepIndex > 0 ? () => openStep(steps[stepIndex - 1]) : undefined

  return (
    <div className="onboard-page">
      <PageBand labelledBy="onboard-title">
        <h1 id="onboard-title" className="page-title">
          {profile ? 'Edit your profile' : 'Set up your profile'}
        </h1>
        <p className="page-lede">Choose your congressional district and the topics you follow.</p>

        {step === 'done' ? <ProfileSections /> : (
          <ol className="onboard-steps" aria-label="Setup steps">
            {steps.map((item, index) => {
              const completed = index < stepIndex
              const content = (
                <>
                  <span className="onboard-steps__number" aria-hidden="true">
                    {completed ? '✓' : index + 1}
                  </span>
                  {STEP_LABELS[item]}
                </>
              )
              return (
                <li key={item} aria-current={index === stepIndex ? 'step' : undefined}>
                  {completed ? (
                    <button type="button" className="onboard-steps__item is-done" disabled={saving || restartRequired} onClick={() => openStep(item)}>
                      {content}
                    </button>
                  ) : (
                    <span className={`onboard-steps__item${index === stepIndex ? ' is-current' : ''}`}>{content}</span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </PageBand>

      <div className="container page-body onboard">
        <div className="panel onboard__panel">
          {step === 'account' ? (
            <AccountStep
              initialName={profile?.username === username ? '' : username}
              next={afterProfile}
              onBack={goBack}
              onCreate={(name) => {
                leaveProfile()
                setError(null)
                setUsername(name)
                if (name !== username) {
                  if (!districtFirst) {
                    setDistrict(null)
                    setAddressToSave(undefined)
                  }
                  setTopics([])
                  setSocials([])
                }
                setStep(afterProfile)
              }}
              onSelect={(name) => {
                try {
                  const saved = selectProfile(name)
                  setError(null)
                  setUsername(saved.username)
                  if (saved.username !== username) {
                    if (!districtFirst) {
                      setDistrict(saved.district)
                      setAddressToSave(undefined)
                    }
                    setTopics(saved.topics)
                    setSocials(saved.socials)
                  }
                  setStep(afterProfile)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'The profile could not be opened.')
                }
              }}
            />
          ) : null}

          {step === 'district' ? (
            <DistrictStep
              initial={district}
              preferAddress={resumeDistrict}
              nextLabel={districtFirst ? 'Continue to your profile' : 'Continue to topics'}
              onBack={goBack}
              onDone={(selection, address) => {
                const sameAddressDistrict = selection.method === 'address' && district?.method === 'address'
                  && district.state === selection.state && district.district === selection.district
                setAddressToSave(address ?? (sameAddressDistrict ? addressToSave : undefined))
                setDistrict(selection)
                setStep(afterDistrict)
              }}
            />
          ) : null}

          {step === 'topics' ? (
            <TopicsStep
              initial={topics}
              onBack={goBack}
              onDone={(nextTopics) => {
                setTopics(nextTopics)
                setStep('social')
              }}
            />
          ) : null}

          {step === 'social' ? (
            <SocialStep
              initial={socials}
              nextLabel={user ? 'Save profile' : 'Continue to phone verification'}
              onBack={goBack}
              onDone={(nextSocials) => {
                saveAttempted.current = false
                setSocials(nextSocials)
                setStep('verify')
              }}
            />
          ) : null}

          {step === 'verify' ? (
            <div className="onboard-step onboard-step--spaced">
              <div className="onboard-step__intro">
                <h2>Phone verification</h2>
              </div>
              {restartRequired ? (
                <>
                  <p className="form-error" role="alert">
                    {codeFailures >= MAX_FAILED_ATTEMPTS
                      ? 'Your code couldn’t be verified after three attempts. Restart setup to try again.'
                      : 'Your profile couldn’t be saved after three attempts. Restart setup to try again.'}
                  </p>
                  <StepActions>
                    <button type="button" className="btn btn--primary" onClick={restartSetup}>Restart setup</button>
                  </StepActions>
                </>
              ) : user && !loading ? (
                error ? (
                  <>
                    <p className="form-error" role="alert">{error}</p>
                    <StepActions onBack={goBack}>
                      <button type="button" className="btn btn--primary" onClick={() => {
                        saveAttempted.current = false
                        void saveProfile()
                      }}>Retry save</button>
                    </StepActions>
                  </>
                ) : <p role="status">Saving your profile…</p>
              ) : (
                <Suspense fallback={<p role="status">Loading phone verification…</p>}>
                  <PhoneAuthForm onBack={goBack} onCodeFailure={() => setCodeFailures((count) => count + 1)} />
                </Suspense>
              )}
            </div>
          ) : null}

          {step === 'done' ? <ProfileSaved district={district} topics={topics} /> : null}

          {error && step !== 'done' && step !== 'verify' ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

        </div>

        {profile && user && step !== 'verify' ? (
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
    </div>
  )
}
