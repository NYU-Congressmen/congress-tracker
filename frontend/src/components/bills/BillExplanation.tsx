import { useState } from 'react'
import { getExplanation } from '../../api/bills'
import type { BillType } from '../../api/bills'
import { useApi } from '../../hooks/useApi'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

// A CRS summary longer than this shows its opening words with a link to the rest
const SUMMARY_PREVIEW_WORDS = 120

interface BillExplanationProps {
  congress: number
  type: BillType
  number: number
  title: string
}

// Split a summary into paragraphs, dropping an opening paragraph that only repeats the title.
function summaryParagraphs(text: string, title: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const same = (a: string, b: string) => a.toLowerCase().replace(/\W+/g, '') === b.toLowerCase().replace(/\W+/g, '')
  if (paragraphs.length > 1 && same(paragraphs[0], title)) return paragraphs.slice(1)
  return paragraphs
}

// Return the paragraphs that fit in the preview, cutting the last one at a word boundary.
function preview(paragraphs: string[]): string[] {
  const shown: string[] = []
  let words = 0
  for (const paragraph of paragraphs) {
    const parts = paragraph.split(/\s+/)
    if (words + parts.length <= SUMMARY_PREVIEW_WORDS) {
      shown.push(paragraph)
      words += parts.length
      continue
    }
    shown.push(`${parts.slice(0, SUMMARY_PREVIEW_WORDS - words).join(' ')}…`)
    break
  }
  return shown
}

function SourceTag({ official }: { official: boolean }) {
  return official ? (
    <span className="explain-tag explain-tag--official">Official summary · Congressional Research Service</span>
  ) : (
    <span className="explain-tag">AI-generated</span>
  )
}

// Show a bill's explanation in four labeled parts, loading separately from the rest of the page.
export function BillExplanation({ congress, type, number, title }: BillExplanationProps) {
  const [expanded, setExpanded] = useState(false)
  const { data, loading, error, refetch } = useApi(
    () => getExplanation(congress, type, number),
    [congress, type, number],
  )

  if (loading) {
    return (
      <section className="panel" aria-label="Explanation">
        <h2>Explanation</h2>
        <LoadingState message="Loading the explanation…" />
      </section>
    )
  }
  if (error || !data) {
    return (
      <section className="panel" aria-label="Explanation">
        <h2>Explanation</h2>
        <ErrorState
          title="The explanation could not be loaded"
          message={error?.message}
          onRetry={error?.status === 404 ? undefined : refetch}
        />
      </section>
    )
  }

  const official = data.does_source === 'crs_summary'
  const paragraphs = official ? summaryParagraphs(data.does, title) : [data.does]
  const shortened = official && paragraphs.join(' ').split(/\s+/).length > SUMMARY_PREVIEW_WORDS
  const shown = shortened && !expanded ? preview(paragraphs) : paragraphs
  const notes: string[] = []
  if (!official) notes.push('Official summary not yet available.')
  if (data.missing.length > 0) {
    const missing = data.missing.join(' and ')
    notes.push(`${missing.charAt(0).toUpperCase()}${missing.slice(1)} unavailable.`)
  }
  if (data.from_stored) notes.push('Showing the last saved version.')

  const aiParts: [string, string][] = [
    ['Limits', data.does_not],
    ['Status', data.stands],
    ['Next steps', data.decides],
  ]

  return (
    <section className="panel" aria-label="Explanation">
      <h2>Explanation</h2>
      {notes.length > 0 ? <p className="explain-note">{notes.join(' ')}</p> : null}
      <div className="explain-grid">
        <article className="explain-part explain-part--wide">
          <div className="explain-part__head">
            <h3>Summary</h3>
            <SourceTag official={official} />
          </div>
          {shown.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {shortened ? (
            <button type="button" className="link-more explain-more" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </article>
        {aiParts.map(([heading, body]) => (
          <article className="explain-part" key={heading}>
            <div className="explain-part__head">
              <h3>{heading}</h3>
              <SourceTag official={false} />
            </div>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
