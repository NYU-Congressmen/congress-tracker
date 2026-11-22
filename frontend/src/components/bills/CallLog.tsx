import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@firebase/auth'
import { Link } from 'react-router-dom'
import type { BillType } from '../../api/bills'
import { listCalls, saveCall } from '../../api/calls'
import { ApiError } from '../../api/client'
import { listMembers } from '../../api/members'
import { useSession } from '../../auth/SessionContext'
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
    <section className="panel" id="call-log" aria-labelledby="call-log-title">
      <h2 id="call-log-title">Call log</h2>
      {user ? <AccountCalls key={user.uid} user={user} {...props} /> : (
        <p className="muted">{loading ? 'Checking your account…' : <><Link to="/sign-in">Sign in</Link> to log a call about this bill.</>}</p>
      )}
    </section>
  )
}

function AccountCalls({ user, congress, type, number }: CallLogProps & { user: User }) {
  const district = useProfile().profile?.district
  const [state, setState] = useState(district?.state ?? '')
  const [memberId, setMemberId] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const requestId = useRef<string | null>(null)
  const members = useApi(() => state ? listMembers({ state }) : Promise.resolve(null), [state])
  const calls = useApi(async () => listCalls(congress, type, number, await user.getIdToken()), [user, congress, type, number])

  const directory = (members.data?.data ?? []).filter((member) => member.state === state)
  const home = district?.state === state ? representativesForDistrict(directory, state, district.district) : null
  const preferred = home ? [...home.house, ...home.senate] : []
  const preferredIds = new Set(preferred.map((member) => member.bioguide_id))
  const offices = [...preferred, ...directory.filter((member) => !preferredIds.has(member.bioguide_id))]

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!memberId || saving) return
    setSaving(true)
    setNotice(null)
    try {
      // Keep the key after a failed response so Retry cannot duplicate a saved call.
      const key = requestId.current ?? crypto.randomUUID()
      requestId.current = key
      await saveCall(congress, type, number, key, memberId, await user.getIdToken())
      requestId.current = null
      setMemberId('')
      setNotice({ error: false, text: 'Call logged.' })
      calls.refetch()
    } catch (error) {
      setNotice({ error: true, text: error instanceof ApiError ? error.message : 'The call could not be saved.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <form onSubmit={submit}>
        <fieldset className="call-log__fields" disabled={saving}>
          <SelectField id="call-state" label="State or territory" value={state} onChange={(value) => {
            setState(value)
            setMemberId('')
            requestId.current = null
            setNotice(null)
          }} options={[{ value: '', label: 'Select a state or territory' }, ...STATE_OPTIONS]} />
          <SelectField id="call-office" label="Office called" value={memberId} onChange={(value) => {
            setMemberId(value)
            requestId.current = null
            setNotice(null)
          }} options={[
            { value: '', label: state && members.loading ? 'Loading offices…' : 'Select an office' },
            ...offices.map((member) => ({ value: member.bioguide_id, label: `${member.name} · ${member.chamber ?? 'Congress'}` })),
          ]} />
          <button type="submit" className="btn btn--secondary" disabled={!memberId || members.loading}>
            {saving ? 'Saving…' : 'Log a call'}
          </button>
        </fieldset>
      </form>
      {state && members.error ? <ErrorState title="Offices could not be loaded" message={members.error.message} onRetry={members.refetch} /> : null}
      {state && !members.loading && !members.error && offices.length === 0 ? <p className="muted">No offices found.</p> : null}
      {notice ? <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'form-error' : 'muted'}>{notice.text}</p> : null}
      {calls.error ? <ErrorState title="Calls could not be loaded" message={calls.error.message} onRetry={calls.refetch} /> : null}
      {calls.data?.length ? (
        <ul className="call-log__entries" aria-label="Recent calls">
          {calls.data.map((call) => (
            <li key={call.action_id}>
              <span>{call.member_name}</span>
              <time className="muted" dateTime={call.created_at}>{formatDateTime(call.created_at)}</time>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
