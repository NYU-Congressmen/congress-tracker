import { useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { clearAccountDistrict, replacesAccountDistrict, saveAccountDistrict } from '../api/account'
import { useSession } from '../auth/SessionContext'
import { PageBand } from '../components/layout/PageBand'
import { AccountStep } from '../components/onboarding/AccountStep'
import { DistrictStep } from '../components/onboarding/DistrictStep'
import { ProfileSaved } from '../components/onboarding/ProfileSaved'
import { ProfileSections } from '../components/onboarding/ProfileSections'
import { SocialStep } from '../components/onboarding/SocialStep'
import { TopicsStep } from '../components/onboarding/TopicsStep'
import { useProfile } from '../profile/ProfileContext'
import type { ProfileChanges } from '../profile/store'
import { PROFILE_SECTIONS, type ProfileSection, type DistrictSelection } from '../profile/types'

// Save one section of the verified reader's profile at a time.
export default function EditProfilePage() {
  const { user, loading } = useSession()
  const { profile, updateProfile } = useProfile()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState<{ section: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const requested = params.get('section') ?? 'district'
  const section = requested === 'saved' || Object.hasOwn(PROFILE_SECTIONS, requested)
    ? requested as ProfileSection | 'saved'
    : 'district'

  if (!loading && !user) return <Navigate to="/sign-in?next=profile" replace />
  if (!loading && !profile) return <Navigate to="/onboarding" replace />

  async function save(changes: ProfileChanges, address?: string) {
    if (!user || pending.current) return
    pending.current = true
    setError(null)
    setSaving(true)
    try {
      const district: DistrictSelection | null | undefined = address
        ? { ...await saveAccountDistrict(user, address), method: 'address' }
        : changes.district
      if (replacesAccountDistrict(district)) await clearAccountDistrict(user)
      updateProfile({ ...changes, district, firebase_uid: user.uid })
      setParams({ section: 'saved' }, { replace: true })
    } catch (cause) {
      setError({ section, message: cause instanceof Error ? cause.message : 'Your changes could not be saved. Try again.' })
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <div className="onboard-page">
      <PageBand labelledBy="edit-profile-title">
        <h1 id="edit-profile-title" className="page-title">Edit your profile</h1>
        {profile ? <ProfileSections active={section === 'saved' ? undefined : section} saving={saving} /> : null}
      </PageBand>
      <div className="container page-body onboard">
        <div className="panel onboard__panel">
          {loading || !profile ? <p role="status">Checking your account…</p> : (
            <>
              {section === 'name' ? (
                <AccountStep initialName={profile.username} next="save" onCreate={(username) => void save({ username })} />
              ) : null}
              {section === 'district' ? (
                <DistrictStep
                  initial={profile.district}
                  preferAddress={false}
                  deferAddressSave
                  nextLabel="Save district"
                  onDone={(district, address) => void save({ district }, address)}
                />
              ) : null}
              {section === 'topics' ? (
                <TopicsStep initial={profile.topics} nextLabel="Save topics" onDone={(topics) => void save({ topics })} />
              ) : null}
              {section === 'social' ? (
                <SocialStep
                  initial={profile.socials}
                  nextLabel="Save Social"
                  onDone={(socials) => void save({ socials })}
                />
              ) : null}
              {section === 'saved' ? <ProfileSaved district={profile.district} topics={profile.topics} /> : null}
            </>
          )}
          {saving ? <p role="status">Saving your profile…</p> : null}
          {error?.section === section ? <p className="form-error" role="alert">{error.message}</p> : null}
        </div>
      </div>
    </div>
  )
}
