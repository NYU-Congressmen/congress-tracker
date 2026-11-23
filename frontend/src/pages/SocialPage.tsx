import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getBill, searchBills } from '../api/bills'
import type { BillSummary } from '../api/bills'
import { getReview, saveReview, STANCES, STANCE_LABELS } from '../api/reviews'
import { useSession } from '../auth/SessionContext'
import { getAccountToken } from '../auth/accountToken'
import { PLATFORMS, platformName } from '../profile/platforms'
import type { SocialProfile } from '../profile/types'
import { useProfile } from '../profile/ProfileContext'
import { listDiscussions, recordDiscussion } from '../social/drafts'
import { BillListItem } from '../components/bills/BillListItem'
import { PageBand } from '../components/layout/PageBand'
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
  const { profile } = useProfile()
  const { user } = useSession()
  const [params] = useSearchParams()
  const linkedBill = params.get('bill')
  return <SocialContent key={JSON.stringify([profile?.username, user?.uid, linkedBill])} linkedBill={linkedBill} />
}

function SocialContent({ linkedBill }: { linkedBill: string | null }) {
  const { profile, updateProfile } = useProfile()
  const { user, loading: sessionLoading } = useSession()
  const discussionOwner = user ? `firebase:${user.uid}` : profile?.username ?? null

  // Saved social handles
  const [socials, setSocials] = useState<SocialProfile[]>(profile?.socials ?? [])
  const [platform, setPlatform] = useState(PLATFORMS[0].id)
  const [handle, setHandle] = useState('')
  const [socialError, setSocialError] = useState<string | null>(null)

  // Composer
  const [billQuery, setBillQuery] = useState('')
  const [billResults, setBillResults] = useState<BillSummary[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SelectedBill | null>(null)
  const selectedBillPath = selected ? `/bills/${selected.congress}/${selected.type}/${selected.number}` : null
  const [stance, setStance] = useState<string>('')
  const [story, setStory] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [consentToShare, setConsentToShare] = useState(false)
  const [sharePublicly, setSharePublicly] = useState(false)
  const [loadingReview, setLoadingReview] = useState(false)
  const [reviewError, setReviewError] = useState(false)
  const reviewLoad = useRef(0)
  const billPicked = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const reviewBlocked = sessionLoading || loadingReview || reviewError || submitting
  const [submitNotice, setSubmitNotice] = useState<{ kind: 'ok' | 'draft' | 'error'; text: string } | null>(null)

  // Local discussion records, newest first
  const [records, setRecords] = useState(() => listDiscussions(discussionOwner))

  // Resolve the bill reference sent by the stance link.
  const preselectMatch = linkedBill ? /^(\d+)-([a-z]+)-(\d+)$/.exec(linkedBill) : null
  const { data: preselected, loading: preselecting } = useApi(
    () =>
      preselectMatch
        ? getBill(Number(preselectMatch[1]), preselectMatch[2] as SelectedBill['type'], Number(preselectMatch[3]))
        : Promise.resolve(null),
    [linkedBill],
  )

  // The bills moving right now, offered as discussion starters.
  const { data: moving } = useApi(() => searchBills({ limit: 6 }), [])

  const loadReview = useCallback(async (bill: BillSummary) => {
    setReviewError(false)
    if (!user) return
    const load = ++reviewLoad.current
    setLoadingReview(true)
    try {
      const review = await getReview(bill.congress, bill.type, bill.number, await getAccountToken(user))
      if (load !== reviewLoad.current) return
      setStance(review.stance)
      setStory(review.story ?? '')
      setActionTaken(review.action_taken ?? '')
      setConsentToShare(review.consent_to_share)
      setSharePublicly(review.share_publicly ?? false)
    } catch (error) {
      if (load === reviewLoad.current && !(error instanceof ApiError && error.status === 404)) {
        setReviewError(true)
      }
    } finally {
      if (load === reviewLoad.current) setLoadingReview(false)
    }
  }, [user])

  const pickBill = useCallback((bill: BillSummary) => {
    // Keep text drafted before the first bill choice. A saved review can replace it.
    if (billPicked.current) {
      setStance('')
      setStory('')
      setActionTaken('')
      setConsentToShare(false)
      setSharePublicly(false)
    }
    billPicked.current = true
    setSelected(bill)
    setBillResults(null)
    setBillQuery('')
    setSubmitNotice(null)
    void loadReview(bill)
  }, [loadReview])

  useEffect(() => {
    if (!preselected) return
    let active = true
    queueMicrotask(() => {
      if (active && !billPicked.current) pickBill(preselected)
    })
    return () => { active = false }
  }, [preselected, pickBill])

  function changeBill() {
    reviewLoad.current += 1
    setLoadingReview(false)
    setReviewError(false)
    setSelected(null)
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
    if (reviewBlocked) return
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
    const review = {
      stance: stance as (typeof STANCES)[number],
      story: story.trim() ? story : null,
      action_taken: actionTaken.trim() ? actionTaken : null,
      consent_to_share: Boolean(user && consentToShare),
      share_publicly: Boolean(user && sharePublicly),
    }
    let saved = false
    let notice: NonNullable<typeof submitNotice> = { kind: 'draft', text: 'Draft saved in this browser.' }
    try {
      if (user) {
        const token = await getAccountToken(user)
        await saveReview(selected.congress, selected.type, selected.number, review, token)
        saved = true
        notice = { kind: 'ok', text: 'Your review is saved.' }
      }
    } catch (cause) {
      const isAuth = cause instanceof ApiError && cause.status === 401
      if (!isAuth) {
        notice = { kind: 'error', text: cause instanceof ApiError ? cause.message : 'The review could not be saved right now.' }
      }
    } finally {
      try {
        recordDiscussion(discussionOwner, {
          bill: {
            congress: selected.congress,
            type: selected.type,
            number: selected.number,
            title: selected.title,
          },
          stance: review.stance,
          story: review.story,
          action_taken: review.action_taken,
          consent: saved && review.consent_to_share,
          saved,
          at: new Date().toISOString(),
        })
        setRecords(listDiscussions(discussionOwner))
      } catch {
        if (!saved) notice = { kind: 'error', text: 'This browser could not save your draft.' }
      }
      setSubmitNotice(notice)
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
      setSocialError(`You already saved a handle for ${platformName(platform)}.`)
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
    <div className="social-page">
      <PageBand labelledBy="social-title">
        <h1 id="social-title" className="page-title">
          Social
        </h1>
        <p className="page-lede">
          Save your stance on a bill and the experience behind it.
        </p>
      </PageBand>

      <div className="container page-body social">

        {!profile ? (
          <div className="social__prompt panel">
            <div>
              <h2>Browser profile</h2>
              <p className="muted">
                Save your discussion drafts with a profile in this browser.
              </p>
            </div>
            <Link to="/onboarding" className="btn btn--primary">
              Set up my profile
            </Link>
          </div>
        ) : null}

        <section className="panel panel--stack" aria-label="Your social profiles">
          <div className="panel__heading-row">
            <h2>Your social profiles</h2>
            <span className="panel__count">
              {socials.length > 0 ? `${socials.length} saved` : ''}
            </span>
          </div>
          {socials.length > 0 ? (
            <ul className="social-list" aria-label="Saved social handles">
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
              No social handles saved.
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
              Add handle
            </button>
          </form>
          {socialError ? (
            <p className="form-error" role="alert">
              {socialError}
            </p>
          ) : null}
        </section>

        <section id="bill-review" className="panel panel--stack" aria-labelledby="bill-review-title">
          <h2 id="bill-review-title">Bill review</h2>
          {!user ? <p className="muted"><Link to="/sign-in">Sign in</Link> to save your review to your account.</p> : null}

          {selected && selectedBillPath ? (
            <div className="social-bill">
              <Link
                to={selectedBillPath}
                className="social-bill__link"
              >
                <span className="social-bill__id">{billNumber(selected.type, selected.number)}</span>
                <span className="social-bill__title">{selected.title}</span>
              </Link>
              <button type="button" className="btn btn--ghost btn--sm" onClick={changeBill} disabled={submitting}>
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
              {linkedBill && preselecting ? <LoadingState message="Loading the bill…" /> : null}
              {linkedBill && !preselecting && !preselected ? (
                <p className="muted">The linked bill could not be loaded. Search for it by title or number.</p>
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

          {sessionLoading ? <LoadingState message="Checking sign-in…" /> : null}
          {loadingReview ? <LoadingState message="Loading your saved review…" /> : null}
          {reviewError && selected ? (
            <p className="form-error" role="alert">
              Your saved review could not be loaded.{' '}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadReview(selected)}>Retry</button>
            </p>
          ) : null}

          <form className="social-composer" onSubmit={submitDiscussion}>
            <fieldset className="social-stance" disabled={reviewBlocked}>
              <legend>Your stance</legend>
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
                disabled={reviewBlocked}
                maxLength={20000}
                onChange={(event) => setStory(event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field__label">Action taken (optional)</span>
              <textarea
                className="field__control social-composer__textarea"
                value={actionTaken}
                disabled={reviewBlocked}
                maxLength={20000}
                onChange={(event) => setActionTaken(event.target.value)}
              />
            </label>

            {user && selected ? (
              <label className="review-consent">
                <input
                  type="checkbox"
                  checked={consentToShare}
                  disabled={reviewBlocked}
                  onChange={(event) => setConsentToShare(event.target.checked)}
                />
                <span>Include this review in the Constituent Signal brief for my representative’s office.</span>
              </label>
            ) : null}

            {user && selected ? (
              <label className="review-consent">
                <input
                  type="checkbox"
                  checked={sharePublicly}
                  disabled={reviewBlocked}
                  onChange={(event) => setSharePublicly(event.target.checked)}
                />
                <span>Publish my stance, story, action taken and district on Pull.</span>
              </label>
            ) : null}

            <button type="submit" className="btn btn--primary btn--lg" disabled={reviewBlocked}>
              {submitting ? 'Saving…' : 'Save my stance'}
            </button>
          </form>

          {submitNotice ? (
            <div className={`social-notice social-notice--${submitNotice.kind}`}>
              <p role="status">{submitNotice.text}</p>
              {submitNotice.kind === 'ok' && selectedBillPath ? (
                <Link to={selectedBillPath}>Back to bill</Link>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel panel--stack" aria-label="Your discussions">
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
            <p className="muted">No saved reviews or drafts.</p>
          )}
        </section>

        <section className="panel panel--stack" aria-label="Recent bill activity">
          <div className="panel__heading-row">
            <h2>Recent bill activity</h2>
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
    </div>
  )
}
