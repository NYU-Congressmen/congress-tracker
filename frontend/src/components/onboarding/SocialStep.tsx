import { useState } from 'react'
import type { FormEvent } from 'react'
import { PLATFORMS, platformName } from '../../profile/platforms'
import type { SocialProfile } from '../../profile/types'
import { SelectField, TextField } from '../ui/Fields'

interface SocialStepProps {
  initial: SocialProfile[]
  onDone: (socials: SocialProfile[]) => void
}

// Step four: connect the social profiles the person shares from, so Pull can
// sign their posts later. Skipping is always allowed.
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
      setError(`You already connected ${platformName(platform)} on this profile.`)
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
        Connect the accounts you post from. Pull signs your shared reviews with these handles, and you can change
        or remove them any time from the Social page. This step is optional.
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
          Connect
        </button>
      </form>

      {socials.length > 0 ? (
        <ul className="onboard-social__list" aria-label="Connected profiles">
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
        <p className="muted onboard-social__empty">No profiles connected yet.</p>
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
