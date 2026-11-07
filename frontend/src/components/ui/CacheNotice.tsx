import type { CacheInfo } from '../../api/bills'
import { formatDateTime } from '../../lib/format'
import { InfoIcon } from '../icons'

interface CacheNoticeProps {
  cache: CacheInfo
  // What the cache covers, e.g. "This bill's full record" or
  // "This member's sponsored bills".
  what: string
}

// The API's `cache` object distinguishes a complete fresh result from a
// stored-but-incomplete or stale one; surface that honestly to the reader.
export function CacheNotice({ cache, what }: CacheNoticeProps) {
  if (cache.complete && !cache.stale && !cache.refresh_failed) return null

  const notes: string[] = []
  if (!cache.complete) {
    notes.push(`${what} has not been fully fetched from Congress.gov yet, so some details may be missing.`)
  } else if (cache.stale) {
    notes.push(
      cache.refreshed_at
        ? `${what} was last fetched ${formatDateTime(cache.refreshed_at)} and may be out of date.`
        : `${what} may be out of date.`,
    )
  }
  if (cache.refresh_failed) {
    notes.push(
      cache.retry_after
        ? `A refresh failed and will be retried after ${formatDateTime(cache.retry_after)}.`
        : 'A refresh failed; the app will retry shortly.',
    )
  }

  return (
    <div className="cache-notice" role="note">
      <InfoIcon className="cache-notice__icon" />
      <p>{notes.join(' ')}</p>
    </div>
  )
}
