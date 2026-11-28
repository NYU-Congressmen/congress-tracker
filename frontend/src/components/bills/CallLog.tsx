import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@firebase/auth'
import { Link } from 'react-router-dom'
import type { BillType } from '../../api/bills'
import { deleteCall, listCalls, saveCall, updateCallNote, type CallEntry } from '../../api/calls'
import { ApiError } from '../../api/client'
import { listMembers } from '../../api/members'
import type { SignalPage } from '../../api/signal'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { useApi } from '../../hooks/useApi'
import { representativesForDistrict } from '../../lib/districts'
import { formatDateTime } from '../../lib/format'
import { useProfile } from '../../profile/ProfileContext'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'
import { SignalTally } from './SignalTally'

interface CallLogProps {
  congress: number
  type: BillType
  number: number
  signal?: SignalPage
  onCallsChanged?: () => void
}

export function CallLog(props: CallLogProps) {
  const { user, loading } = useSession()
  return (
    <section className="panel panel--stack" id="call-log" aria-labelledby="call-log-title">
      <h2 id="call-log-title">Contact your representatives</h2>
      {user ? <AccountCalls key={user.uid} user={user} {...props} /> : (
        <p className="muted">{loading ? 'Checking your account…' : <><Link to="/sign-in">Sign in</Link> to see your offices and keep a private call log.</>}</p>
      )}
    </section>
  )
}

function AccountCalls({ user, congress, type, number, signal, onCallsChanged }: CallLogProps & { user: User }) {
  const { profile, loading: profileLoading } = useProfile()
  const district = profile?.district
  const state = district?.state ?? ''
  const [saving, setSaving] = useState(false)
  const [callError, setCallError] = useState<{ officeId: string; text: string } | null>(null)
  const pending = useRef(new Map<string, string>())
  const submitting = useRef(new Set<string>())
  const members = useApi(() => state ? listMembers({ state }) : Promise.resolve(null), [state])
  const calls = useApi(
    async () => listCalls(congress, type, number, await getAccountToken(user)),
    [user, congress, type, number],
  )
  const tallies = new Map((signal?.offices ?? []).map((office) => [office.bioguide_id, office]))

  const directory = (members.data?.data ?? []).filter((member) => member.state === state)
  const home = district ? representativesForDistrict(directory, state, district.district) : null
  const offices = home ? [...home.house, ...home.senate] : []

  async function recordCall(officeId: string) {
    if (submitting.current.has(officeId)) return
    submitting.current.add(officeId)
    setSaving(true)
    setCallError(null)
    try {
      // Keep the key for this office until the server confirms the write.
      const key = pending.current.get(officeId) ?? crypto.randomUUID()
      pending.current.set(officeId, key)
      // Firebase returns its cached token without a network request, so the save starts
      // before the dialer takes focus, and keepalive lets it finish if the page is hidden.
      await saveCall(congress, type, number, key, officeId, await getAccountToken(user))
      pending.current.delete(officeId)
      calls.refetch()
      onCallsChanged?.()
    } catch (error) {
      setCallError({
        officeId,
        text: error instanceof ApiError ? error.message : 'The call could not be saved.',
      })
    } finally {
      submitting.current.delete(officeId)
      setSaving(submitting.current.size > 0)
    }
  }

  async function saveNote(actionId: number, text: string | null) {
    await updateCallNote(congress, type, number, actionId, await getAccountToken(user), text)
    calls.refetch()
  }

  async function removeCall(actionId: number) {
    await deleteCall(congress, type, number, actionId, await getAccountToken(user))
    calls.refetch()
    onCallsChanged?.()
  }

  return (
    <>
      {profileLoading || (state && members.loading && !members.data) ? (
        <LoadingState message="Loading your offices…" />
      ) : !district ? (
        <p className="muted"><Link to="/profile?section=district">Set your district</Link> to find your congressional offices.</p>
      ) : members.error ? (
        <ErrorState title="Offices could not be loaded" message={members.error.message} onRetry={members.refetch} />
      ) : offices.length ? (
        <>
          <p className="muted">
            Opening a phone number saves an entry in your private call log. Each office also gets a weekly Constituent
            Signal counting the constituents who included their review in the brief, shown here for the past seven days.
            {signal?.includes_sample ? <span className="bill-stances__sample">Sample data</span> : null}
          </p>
          <ul className="call-log__offices" aria-label="Your congressional offices">
            {offices.map((member) => {
              const phone = member.office_phone?.replace(/[^\d+]/g, '')
              const tally = tallies.get(member.bioguide_id)
              return (
                <li key={member.bioguide_id}>
                  <span>{member.name}</span>
                  {phone ? (
                    <a aria-label={`Call ${member.name}`} href={`tel:${phone}`}
                      onClick={() => void recordCall(member.bioguide_id)}>
                      {member.office_phone}
                    </a>
                  ) : <Link to={`/members/${member.bioguide_id}`}>Office details</Link>}
                  {signal && tally ? (
                    <span className="call-log__signal">
                      <span className="call-log__signal-label">Constituent Signal</span>{' '}
                      <SignalTally counts={tally} minimum={signal.min_counted} />{' '}
                      <Link to={`/members/${member.bioguide_id}#signal`} className="link-more">Public record</Link>
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : <p className="muted">No offices found for your district.</p>}
      <section className="call-log__history" aria-labelledby="call-history-title">
        <h3 id="call-history-title">Call log</h3>
        {callError ? (
          <div className="form-error" role="alert">
            {callError.text}{' '}
            <button type="button" className="link-more" disabled={saving}
              onClick={() => void recordCall(callError.officeId)}>Retry save</button>
          </div>
        ) : null}
        {calls.error ? (
          <ErrorState title="Calls could not be loaded" message={calls.error.message} onRetry={calls.refetch} />
        ) : calls.data?.length ? (
          <ul className="call-log__entries" aria-label="Recent calls">
            {calls.data.map((call) => <SavedCall key={call.action_id} call={call} onSave={saveNote} onDelete={removeCall} />)}
          </ul>
        ) : calls.loading ? <LoadingState message="Loading calls…" /> : <p className="muted">No calls logged for this bill.</p>}
      </section>
    </>
  )
}

// Show a saved call with controls for its note and removal.
function SavedCall({ call, onSave, onDelete }: {
  call: CallEntry
  onSave: (actionId: number, text: string | null) => Promise<void>
  onDelete: (actionId: number) => Promise<void>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving || draft === null) return
    setSaving(true)
    setError(null)
    try {
      await onSave(call.action_id, draft.trim() || null)
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The note could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await onDelete(call.action_id)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The call could not be deleted.')
      setSaving(false)
    }
  }

  return (
    <li>
      <div className="call-log__entry-heading">
        <div className="call-log__entry-office">
          <span>{call.member_name}</span>
          {draft === null && !confirming ? (
            <button type="button" className="link-more" onClick={() => {
              setError(null)
              setDraft(call.note ?? '')
            }}>
              {call.note ? 'Edit note' : 'Add note'}
            </button>
          ) : null}
        </div>
        <div className="call-log__entry-meta">
          <time className="muted" dateTime={call.created_at}>{formatDateTime(call.created_at)}</time>
          {draft === null && !confirming ? (
            <button type="button" className="link-more call-log__delete" onClick={() => {
              setError(null)
              setConfirming(true)
            }}>Delete</button>
          ) : null}
        </div>
      </div>
      {draft === null ? (
        call.note ? <p className="call-log__entry-note muted">{call.note}</p> : null
      ) : (
        <form className="call-log__edit" onSubmit={save}>
          <label className="field">
            <span className="field__label">Call note</span>
            <textarea className="field__control call-log__note-input" value={draft} maxLength={2000} rows={2}
              onChange={(event) => setDraft(event.target.value)} />
          </label>
          <div className="call-log__edit-actions">
            <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => {
              setError(null)
              setDraft(null)
            }}>Cancel</button>
            <button type="submit" className="btn btn--secondary btn--sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </form>
      )}
      {confirming ? (
        <div className="call-log__delete-confirm" role="group" aria-label="Delete this call?">
          <p>Delete this call?</p>
          <div className="call-log__edit-actions">
            <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => {
              setError(null)
              setConfirming(false)
            }} autoFocus>Keep call</button>
            <button type="button" className="btn btn--secondary btn--sm call-log__confirm-delete"
              disabled={saving} onClick={() => void remove()}>
              {saving ? 'Deleting…' : 'Delete call'}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="form-error">{error}</p> : null}
    </li>
  )
}
