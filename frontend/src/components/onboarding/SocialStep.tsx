import { useState } from 'react'
import type { FormEvent } from 'react'
import { PLATFORMS, platformName } from '../../profile/platforms'
import type { SocialProfile } from '../../profile/types'
import { SelectField, TextField } from '../ui/Fields'

interface SocialStepProps {
  initial: SocialProfile[]
  onDone: (socials: SocialProfile[]) => void
}

// Save optional social handles with the local profile.
export function SocialStep({ initial, onDone }: SocialStepProps) {
  const [socials, setSocials] = useState<SocialProfile[]>(initial)
  const [platform, setPlatform] = useState(PLATFORMS[0].id)
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)

  function add(event: FormEvent) {
    event.preventDefault()
    const value = handle.trim()
    if (!value) {
      setError('Add the handle or profile URL for that platform.')
      return
    }
    if (socials.some((social) => social.platform === platform)) {
      setError(`You already saved a handle for ${platformName(platform)} on this profile.`)
      return
    }
    setSocials([...socials, { platform, handle: value }])
    setHandle('')
    setError(null)
  }

  function remove(target: string) {
    setSocials(socials.filter((social) => social.platform !== target))
    setError(null)
  }

  return (
    <div className="onboard-step">
      <p className="muted">
        Save the handles you use on social platforms. You can edit them on the Social page.
      </p>

      <form className="onboard-social__form" onSubmit={add}>
        <SelectField
          id="social-platform"
          label="Platform"
          value={platform}
          onChange={setPlatform}
          options={PLATFORMS.map((option) => ({ value: option.id, label: option.name }))}
        />
        <TextField
          id="social-handle"
          label="Handle or profile"
          value={handle}
          onChange={setHandle}
          placeholder={PLATFORMS.find((option) => option.id === platform)?.handleHint ?? 'Your handle'}
        />
        <button type="submit" className="btn btn--secondary">
          Add handle
        </button>
      </form>

      {socials.length > 0 ? (
        <ul className="onboard-social__list" aria-label="Saved social handles">
          {socials.map((social) => (
            <li key={social.platform} className="onboard-social__item">
              <span className="onboard-social__platform">{platformName(social.platform)}</span>
              <span className="onboard-social__handle">{social.handle}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(social.platform)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted onboard-social__empty">No social handles saved.</p>
      )}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="onboard-step__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={() => onDone(socials)}>
          {socials.length > 0 ? 'Finish setup' : 'Skip for now and finish'}
        </button>
      </div>
    </div>
  )
}
