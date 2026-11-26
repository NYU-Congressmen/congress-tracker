import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@firebase/auth'
import { Link } from 'react-router-dom'
import type { BillType } from '../../api/bills'
import { listCalls, saveCall } from '../../api/calls'
import { ApiError } from '../../api/client'
import { listMembers } from '../../api/members'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { useApi } from '../../hooks/useApi'
import { STATE_OPTIONS } from '../../lib/constants'
import { representativesForDistrict } from '../../lib/districts'
import { formatDateTime } from '../../lib/format'
import { useProfile } from '../../profile/ProfileContext'
import { ErrorState } from '../ui/ErrorState'
import { SelectField } from '../ui/Fields'

interface CallLogProps {
  congress: number
  type: BillType
  number: number
}

export function CallLog(props: CallLogProps) {
  const { user, loading } = useSession()
  return (
    <section className="panel panel--stack" id="call-log" aria-labelledby="call-log-title">
      <h2 id="call-log-title">Call log</h2>
      {user ? <AccountCalls key={user.uid} user={user} {...props} /> : (
        <p className="muted">{loading ? 'Checking your account…' : <><Link to="/sign-in">Sign in</Link> to log a call about this bill.</>}</p>
      )}
    </section>
  )
}

function AccountCalls({ user, congress, type, number }: CallLogProps & { user: User }) {
  const district = useProfile().profile?.district
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const state = selectedState ?? district?.state ?? ''
  const [memberId, setMemberId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string; retryOffice?: string } | null>(null)
  const pending = useRef(new Map<string, string>())
  const submitting = useRef(new Set<string>())
  const recentToken = useRef<{ value: string; obtainedAt: number } | null>(null)
  const members = useApi(() => state ? listMembers({ state }) : Promise.resolve(null), [state])
  const calls = useApi(async () => {
    const value = await getAccountToken(user)
    recentToken.current = { value, obtainedAt: Date.now() }
    return listCalls(congress, type, number, value)
  }, [user, congress, type, number])

  const directory = (members.data?.data ?? []).filter((member) => member.state === state)
  const home = district?.state === state ? representativesForDistrict(directory, state, district.district) : null
  const preferred = home ? [...home.house, ...home.senate] : []
  const preferredIds = new Set(preferred.map((member) => member.bioguide_id))
  const offices = [...preferred, ...directory.filter((member) => !preferredIds.has(member.bioguide_id))]

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (memberId && await recordCall(memberId, note.trim() || undefined)) {
      setMemberId('')
      setNote('')
    }
  }

  async function recordCall(officeId: string, text?: string, retryFromNotice = false): Promise<boolean> {
    if (submitting.current.has(officeId)) return false
    submitting.current.add(officeId)
    setSaving(true)
    setNotice(null)
    try {
      // Keep the key for this office until the server confirms the write.
      const key = pending.current.get(officeId) ?? crypto.randomUUID()
      pending.current.set(officeId, key)
      // Start the request before the dialer takes focus when a recently checked token is available.
      const token = recentToken.current
      const value = token && Date.now() - token.obtainedAt < 60_000 ? token.value : await getAccountToken(user)
      const saved = await saveCall(congress, type, number, key, officeId, value, text)
      pending.current.delete(officeId)
      const message = (saved.note ?? undefined) === text ? 'Call logged.' : 'The call was already logged with its original note.'
      setNotice({ error: false, text: message })
      calls.refetch()
      return true
    } catch (error) {
      setNotice({
        error: true,
        text: error instanceof ApiError ? error.message : 'The call could not be saved.',
        retryOffice: retryFromNotice ? officeId : undefined,
      })
      return false
    } finally {
      submitting.current.delete(officeId)
      setSaving(submitting.current.size > 0)
    }
  }

  const directoryForm = (
      <form onSubmit={submit}>
        <fieldset className="call-log__fields" disabled={saving}>
          <SelectField id="call-state" label="State or territory" value={state} onChange={(value) => {
            setSelectedState(value)
            setMemberId('')
            setNotice(null)
          }} options={[{ value: '', label: 'Select a state or territory' }, ...STATE_OPTIONS]} />
          <SelectField id="call-office" label="Office called" value={memberId} onChange={(value) => {
            setMemberId(value)
            setNotice(null)
          }} options={[
            { value: '', label: state && members.loading ? 'Loading offices…' : 'Select an office' },
            ...offices.map((member) => ({ value: member.bioguide_id, label: `${member.name} · ${member.chamber ?? 'Congress'}` })),
          ]} />
          <label className="field call-log__note">
            <span className="field__label">Note (optional)</span>
            <textarea className="field__control call-log__note-input" value={note} maxLength={2000} rows={2}
              onChange={(event) => {
                setNote(event.target.value)
                setNotice(null)
              }} />
          </label>
          <button type="submit" className="btn btn--secondary call-log__submit" disabled={!memberId || members.loading}>
            {saving ? 'Saving…' : 'Log a call'}
          </button>
        </fieldset>
      </form>
  )
  const contactOffices = preferred.flatMap((member) => {
    const phone = member.office_phone?.replace(/[^\d+]/g, '')
    return phone ? [{ member, phone }] : []
  })

  return (
    <>
      {contactOffices.length ? (
        <>
          <p className="muted">Opening a phone number adds an entry to your call log.</p>
          <ul className="call-log__offices" aria-label="Your congressional offices">
            {contactOffices.map(({ member, phone }) => (
              <li key={member.bioguide_id}>
                <span>{member.name}</span>
                <a aria-label={`Call ${member.name}`} href={`tel:${phone}`}
                  onClick={() => void recordCall(member.bioguide_id, undefined, true)}>
                  {member.office_phone}
                </a>
              </li>
            ))}
          </ul>
          <details className="call-log__other">
            <summary>Log a call manually</summary>
            {directoryForm}
          </details>
        </>
      ) : directoryForm}
      {state && members.error ? <ErrorState title="Offices could not be loaded" message={members.error.message} onRetry={members.refetch} /> : null}
      {state && !members.loading && !members.error && offices.length === 0 ? <p className="muted">No offices found.</p> : null}
      {notice ? (
        <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'form-error' : 'muted'}>
          {notice.text}
          {notice.retryOffice ? (
            <> <button type="button" className="link-more" disabled={saving}
              onClick={() => notice.retryOffice && void recordCall(notice.retryOffice, undefined, true)}>
              Retry save
            </button></>
          ) : null}
        </p>
      ) : null}
      {calls.error ? <ErrorState title="Calls could not be loaded" message={calls.error.message} onRetry={calls.refetch} /> : null}
      {calls.data?.length ? (
        <ul className="call-log__entries" aria-label="Recent calls">
          {calls.data.map((call) => (
            <li key={call.action_id}>
              <div className="call-log__entry-heading">
                <span>{call.member_name}</span>
                <time className="muted" dateTime={call.created_at}>{formatDateTime(call.created_at)}</time>
              </div>
              {call.note ? <p className="call-log__entry-note muted">{call.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
