import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { PLATFORMS, platformName } from '../../profile/platforms'
import type { SocialProfile } from '../../profile/types'
import { SelectField, TextField } from '../ui/Fields'
import { StepActions } from './StepActions'

interface SocialStepProps {
  initial: SocialProfile[]
  nextLabel: string
  onBack?: () => void
  onDone: (socials: SocialProfile[]) => void
}

// Save optional social handles with the local profile.
export function SocialStep({ initial, nextLabel, onBack, onDone }: SocialStepProps) {
  const formId = useId()
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
    <div className="onboard-step onboard-step--spaced">
      <div className="onboard-step__intro">
        <h2>Social profiles</h2>
        <p className="muted">Add a handle now or later on the Social page.</p>
      </div>

      <form id={formId} className="onboard-social__form" onSubmit={add}>
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
        {onBack ? <button type="submit" className="btn btn--secondary">Add handle</button> : null}
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
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <StepActions onBack={onBack}>
        {onBack ? null : <button type="submit" form={formId} className="btn btn--secondary">Add handle</button>}
        <button type="button" className="btn btn--primary" onClick={() => onDone(socials)}>
          {nextLabel}
        </button>
      </StepActions>
    </div>
  )
}
