import { useEffect, useRef, useState } from 'react'
import type { BillDetail } from '../../api/bills'
import { getReviewSummary, writeReviewSummary } from '../../api/reviewSummary'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { formatDate } from '../../lib/format'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

// Word sizes run from the smallest to the largest step by how many stories use the word.
const SIZE_STEPS = 5

// Sum up what shared stories say about a bill, with AI highlights and their most frequent words.
export function ReviewHighlights({ bill, revision = 0 }: { bill: BillDetail; revision?: number }) {
  const { user, loading } = useSession()
  const { congress, type, number } = bill
  const asked = useRef(false)
  const [tried, setTried] = useState(false)
  const summary = useApi(
    async () => loading ? null : getReviewSummary(congress, type, number, user ? await getAccountToken(user) : undefined),
    [congress, type, number, user, loading, revision],
  )
  const page = summary.data
  const { refetch } = summary

  // A signed-in reader's visit writes missing highlights once, within the daily limit.
  useEffect(() => {
    if (!user || !page || page.highlights || page.story_count < page.min_stories || asked.current) return
    asked.current = true
    void (async () => {
      try {
        await writeReviewSummary(congress, type, number, await getAccountToken(user))
        refetch()
      } catch {
        // The word cloud still stands on its own when highlights cannot be written
      } finally {
        setTried(true)
      }
    })()
  }, [user, page, congress, type, number, refetch])

  const top = Math.max(1, ...(page?.words ?? []).map((item) => item.count))
  const groups = page?.highlights ? ([
    ['Supporters', page.highlights.support],
    ['Opponents', page.highlights.oppose],
    ['Unsure', page.highlights.unsure],
  ] as const).filter(([, text]) => text) : []

  return (
    <section className="panel panel--stack" aria-labelledby="review-highlights">
      <div className="panel__heading-row">
        <h2 id="review-highlights">What reviewers say</h2>
        {page?.includes_sample ? <span className="bill-stances__sample">Sample data</span> : null}
      </div>
      {summary.loading || (!page && !summary.error) ? (
        <LoadingState message="Reading the shared stories…" />
      ) : summary.error ? (
        <ErrorState title="The summary could not be loaded" message={summary.error.message} onRetry={refetch} />
      ) : page && page.story_count < page.min_stories ? (
        <p className="muted">A summary appears once at least {page.min_stories} people share a story about this bill.</p>
      ) : page ? (
        <>
          {groups.length ? (
            <div className="highlights">
              <span className="bill-stances__sample">AI-generated</span>
              <dl className="highlights__groups">
                {groups.map(([label, text]) => (
                  <div key={label}><dt>{label}</dt><dd>{text}</dd></div>
                ))}
              </dl>
              {page.highlights!.themes.length ? (
                <ul className="highlights__themes" aria-label="Recurring themes">
                  {page.highlights!.themes.map((theme) => <li key={theme} className="chip">{theme}</li>)}
                </ul>
              ) : null}
              <p className="muted review__meta">
                Written from {page.story_count} shared stories{page.highlights_at ? ` on ${formatDate(page.highlights_at.slice(0, 10))}` : ''}.
              </p>
            </div>
          ) : (
            <p className="muted">
              {user && !tried ? 'Writing highlights from the shared stories…' : 'AI highlights are not available for these stories yet.'}
            </p>
          )}
          <ul className="word-cloud" aria-label={`Words used most in ${page.story_count} shared stories`}>
            {page.words.map((item) => (
              <li key={item.word} className={`word-cloud__word word-cloud__word--${Math.ceil((item.count / top) * SIZE_STEPS)}`}
                title={`${item.count} ${item.count === 1 ? 'story' : 'stories'}`}>
                {item.word}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
