import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getBill, searchBills } from '../api/bills'
import type { BillSummary } from '../api/bills'
import { saveReview, STANCES, STANCE_LABELS } from '../api/reviews'
import { PLATFORMS, platformName } from '../profile/platforms'
import type { SocialProfile } from '../profile/types'
import { useProfile } from '../profile/ProfileContext'
import { listDiscussions, recordDiscussion } from '../social/drafts'
import { BillListItem } from '../components/bills/BillListItem'
import { useApi } from '../hooks/useApi'
import { billNumber } from '../lib/format'
import { TextField } from '../components/ui/Fields'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'

interface SelectedBill extends BillSummary {
  title: string
}

// The place where discussion about current policy happens: a person's social
// profiles, their stance on a bill and the story behind it, and the bills
// moving now that are worth weighing in on.
export default function SocialPage() {
  const { profile, updateProfile } = useProfile()
  const [params] = useSearchParams()

  // Connected profiles
  const [socials, setSocials] = useState<SocialProfile[]>(profile?.socials ?? [])
  const [platform, setPlatform] = useState(PLATFORMS[0].id)
  const [handle, setHandle] = useState('')
  const [socialError, setSocialError] = useState<string | null>(null)

  // Composer
  const [billQuery, setBillQuery] = useState('')
  const [billResults, setBillResults] = useState<BillSummary[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SelectedBill | null>(null)
  const [stance, setStance] = useState<string>('')
  const [story, setStory] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitNotice, setSubmitNotice] = useState<{ kind: 'ok' | 'draft' | 'error'; text: string } | null>(null)

  // Local discussion records, newest first
  const [records, setRecords] = useState(() => listDiscussions())

  // Preselect a bill when the reader arrives from a bill page's "your stance" link.
  const preselect = params.get('bill')
  const preselectMatch = preselect ? /^(\d+)-([a-z]+)-(\d+)$/.exec(preselect) : null
  const { data: preselected, loading: preselecting } = useApi(
    () =>
      preselectMatch
        ? getBill(Number(preselectMatch[1]), preselectMatch[2] as SelectedBill['type'], Number(preselectMatch[3]))
        : Promise.resolve(null),
    [preselect],
  )

  // The bills moving right now, offered as discussion starters.
  const { data: moving } = useApi(() => searchBills({ limit: 6 }), [])

  function pickBill(bill: BillSummary) {
    setSelected(bill)
    setBillResults(null)
    setBillQuery('')
    setSubmitNotice(null)
  }

  async function findBills(event: FormEvent) {
    event.preventDefault()
    const query = billQuery.trim()
    if (query.length < 2) {
      setBillResults([])
      return
    }
    setSearching(true)
    try {
      const page = await searchBills({ q: query, limit: 6 })
      setBillResults(page.data)
    } catch {
      setBillResults([])
    } finally {
      setSearching(false)
    }
  }

  async function submitDiscussion(event: FormEvent) {
    event.preventDefault()
    setSubmitNotice(null)
    if (!selected) {
      setSubmitNotice({ kind: 'error', text: 'Find the bill you want to weigh in on first.' })
      return
    }
    if (!stance) {
      setSubmitNotice({ kind: 'error', text: 'Choose where you stand: support, oppose or unsure.' })
      return
    }
    setSubmitting(true)
    try {
      await saveReview(selected.congress, selected.type, selected.number, {
        stance: stance as (typeof STANCES)[number],
        story: story.trim() || null,
        action_taken: actionTaken.trim() || null,
        consent_to_share: consent && socials.length > 0,
      })
      recordDiscussion({
        bill: {
          congress: selected.congress,
          type: selected.type,
          number: selected.number,
          title: selected.title,
        },
        stance: stance as (typeof STANCES)[number],
        story: story.trim() || null,
        action_taken: actionTaken.trim() || null,
        consent: consent && socials.length > 0,
        saved: true,
        at: new Date().toISOString(),
      })
      setRecords(listDiscussions())
      setStory('')
      setActionTaken('')
      setConsent(false)
      setSubmitNotice({ kind: 'ok', text: 'Your review is saved. That is how your stance shows on the bill page.' })
    } catch (cause) {
      const isAuth = cause instanceof ApiError && cause.status === 401
      recordDiscussion({
        bill: {
          congress: selected.congress,
          type: selected.type,
          number: selected.number,
          title: selected.title,
        },
        stance: stance as (typeof STANCES)[number],
        story: story.trim() || null,
        action_taken: actionTaken.trim() || null,
        consent: consent && socials.length > 0,
        saved: false,
        at: new Date().toISOString(),
      })
      setRecords(listDiscussions())
      setSubmitNotice(
        isAuth
          ? { kind: 'draft', text: 'Sign-in through the backend is not live yet, so this is saved as a draft on this device. It will sync to your account when sign-in goes live.' }
          : { kind: 'error', text: cause instanceof Error ? cause.message : 'The review could not be saved right now.' },
      )
    } finally {
      setSubmitting(false)
    }
  }

  function addSocial(event: FormEvent) {
    event.preventDefault()
    setSocialError(null)
    const value = handle.trim()
    if (!value) {
      setSocialError('Add the handle or profile URL for that platform.')
      return
    }
    if (socials.some((social) => social.platform === platform)) {
      setSocialError(`You already connected ${platformName(platform)}.`)
      return
    }
    const next = [...socials, { platform, handle: value }]
    setSocials(next)
    setHandle('')
    if (profile) updateProfile({ socials: next })
  }

  function removeSocial(target: string) {
    const next = socials.filter((social) => social.platform !== target)
    setSocials(next)
    if (profile) updateProfile({ socials: next })
  }

  return (
    <div className="container page social">
      <header className="page__header">
        <h1>Social</h1>
        <p className="page__lede">
          Where the discussion about current policy happens: say where you stand on a bill, tell the story behind it,
          and follow what is moving.
        </p>
      </header>

      {!profile ? (
        <div className="social__prompt panel">
          <h2>Join the discussion</h2>
          <p className="muted">
            Set up your profile and your stances attach to your account, with the option to share them to your social
            profiles.
          </p>
          <Link to="/onboarding" className="btn btn--primary">
            Set up my profile
          </Link>
        </div>
      ) : null}

      <section className="panel" aria-label="Your social profiles">
        <div className="panel__heading-row">
          <h2>Your social profiles</h2>
          <span className="panel__count">
            {socials.length > 0 ? `${socials.length} ${socials.length === 1 ? 'connected' : 'connected'}` : ''}
          </span>
        </div>
        {socials.length > 0 ? (
          <ul className="social-list" aria-label="Connected profiles">
            {socials.map((social) => (
              <li key={social.platform} className="social-list__item">
                <span className="social-list__platform">{platformName(social.platform)}</span>
                <span className="social-list__handle">{social.handle}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeSocial(social.platform)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No profiles connected. Connect one and Pull can sign the reviews you choose to share.
          </p>
        )}
        <form className="social-add" onSubmit={addSocial}>
          <label className="field">
            <span className="field__label">Platform</span>
            <select className="field__control" value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {PLATFORMS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field social-add__handle">
            <span className="field__label">Handle or profile</span>
            <input
              className="field__control"
              value={handle}
              placeholder={PLATFORMS.find((option) => option.id === platform)?.handleHint ?? 'Your handle'}
              onChange={(event) => setHandle(event.target.value)}
            />
          </label>
          <button type="submit" className="btn btn--secondary">
            Connect
          </button>
        </form>
        {socialError ? (
          <p className="form-error" role="alert">
            {socialError}
          </p>
        ) : null}
      </section>

      <section className="panel" aria-label="Start a discussion">
        <h2>Start a discussion</h2>

        {selected ? (
          <div className="social-bill">
            <Link
              to={`/bills/${selected.congress}/${selected.type}/${selected.number}`}
              className="social-bill__link"
            >
              <span className="social-bill__id">{billNumber(selected.type, selected.number)}</span>
              <span className="social-bill__title">{selected.title}</span>
            </Link>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
              Change bill
            </button>
          </div>
        ) : (
          <>
            <form className="social-find" onSubmit={findBills}>
              <TextField
                id="social-bill-search"
                label="Find a bill"
                type="search"
                value={billQuery}
                onChange={setBillQuery}
                placeholder="Search by keyword, for example “clean water”"
              />
              <button type="submit" className="btn btn--secondary" disabled={searching}>
                {searching ? 'Searching…' : 'Search bills'}
              </button>
            </form>
            {preselecting ? <LoadingState message="Loading the bill…" /> : null}
            {preselected ? (
              <button type="button" className="btn btn--ghost btn--sm social-bill-suggest" onClick={() => pickBill(preselected)}>
                Use “{billNumber(preselected.type, preselected.number)}”
              </button>
            ) : null}
            {billResults ? (
              billResults.length > 0 ? (
                <ul className="social-results" aria-label="Matching bills">
                  {billResults.map((bill) => (
                    <li key={bill.bill_id}>
                      <button type="button" className="social-results__item" onClick={() => pickBill(bill)}>
                        <span className="social-results__id">{billNumber(bill.type, bill.number)}</span>
                        <span className="social-results__title">{bill.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No bills matched" hint="Try a different keyword." />
              )
            ) : null}
          </>
        )}

        <form className="social-composer" onSubmit={submitDiscussion}>
          <fieldset className="social-stance">
            <legend>Where do you stand?</legend>
            {STANCES.map((option) => (
              <label key={option} className={`social-stance__option${stance === option ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="stance"
                  value={option}
                  checked={stance === option}
                  onChange={() => setStance(option)}
                />
                {STANCE_LABELS[option]}
              </label>
            ))}
          </fieldset>

          <label className="field">
            <span className="field__label">Your story (optional)</span>
            <textarea
              className="field__control social-composer__textarea"
              value={story}
              maxLength={20000}
              placeholder="What does this bill mean to you?"
              onChange={(event) => setStory(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">What have you done about it? (optional)</span>
            <textarea
              className="field__control social-composer__textarea"
              value={actionTaken}
              maxLength={20000}
              placeholder="Called your representative, attended a hearing, organized a neighbor…"
              onChange={(event) => setActionTaken(event.target.value)}
            />
          </label>

          {socials.length > 0 ? (
            <label className="social-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              Share this to my social profiles ({socials.map((social) => platformName(social.platform)).join(', ')})
            </label>
          ) : (
            <p className="muted social-consent-hint">
              Connect a social profile above to share your reviews there.
            </p>
          )}

          <button type="submit" className="btn btn--primary btn--lg" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save my stance'}
          </button>
        </form>

        {submitNotice ? (
          <p className={`social-notice social-notice--${submitNotice.kind}`} role="status">
            {submitNotice.text}
          </p>
        ) : null}
      </section>

      <section className="panel" aria-label="Your discussions">
        <div className="panel__heading-row">
          <h2>Your discussions</h2>
          <span className="panel__count">{records.length > 0 ? `${records.length} so far` : ''}</span>
        </div>
        {records.length > 0 ? (
          <ul className="discussions" aria-label="Recent discussions">
            {records.map((record) => (
              <li key={`${record.bill.congress}-${record.bill.type}-${record.bill.number}`} className="discussions__item">
                <Link
                  to={`/bills/${record.bill.congress}/${record.bill.type}/${record.bill.number}`}
                  className="discussions__link"
                >
                  <span className="discussions__id">{billNumber(record.bill.type, record.bill.number)}</span>
                  <span className="discussions__title">{record.bill.title}</span>
                </Link>
                <span className={`discussions__stance discussions__stance--${record.stance}`}>
                  {STANCE_LABELS[record.stance]}
                </span>
                <span className={`discussions__status${record.saved ? '' : ' discussions__status--draft'}`}>
                  {record.saved ? 'Saved' : 'Draft'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No discussions yet. Pick a bill above and say where you stand.</p>
        )}
      </section>

      <section className="panel" aria-label="Bills moving now">
        <div className="panel__heading-row">
          <h2>What is moving</h2>
          <Link to="/bills" className="link-more">
            All bills
          </Link>
        </div>
        {moving?.data.length ? (
          <ul className="bill-list bill-list--compact" aria-label="Bills moving now">
            {moving.data.map((bill) => (
              <BillListItem key={bill.bill_id} bill={bill} />
            ))}
          </ul>
        ) : (
          <p className="muted">The latest activity will appear here.</p>
        )}
      </section>
    </div>
  )
}
