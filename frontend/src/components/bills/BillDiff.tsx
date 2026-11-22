import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { diffTextVersions, listTextVersions } from '../../api/texts'
import type { BillDiff as DiffResult, TextVersion } from '../../api/texts'
import type { BillType } from '../../api/bills'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { useApi } from '../../hooks/useApi'
import { formatDate } from '../../lib/format'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { SelectField } from '../ui/Fields'
import { LoadingState } from '../ui/LoadingState'
import { ExternalLinkIcon } from '../icons'

interface BillDiffProps {
  congress: number
  type: BillType
  number: number
}

interface TextBlock {
  kind: 'added' | 'removed' | 'context'
  lines: string[]
}

// Group adjacent lines within each excerpt so a passage shares one label.
function comparisonBlocks(changes: string[]): TextBlock[] {
  const blocks: TextBlock[] = []
  let block: TextBlock | undefined
  // The backend starts each nonempty diff with the two version names.
  for (const line of changes.slice(2)) {
    if (line.startsWith('@@')) {
      block = undefined
      continue
    }
    const kind = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context'
    if (block?.kind !== kind) {
      block = { kind, lines: [] }
      blocks.push(block)
    }
    block.lines.push(line.slice(1))
  }
  return blocks
}

// Reflow source lines while keeping paragraph breaks marked by blank lines.
function passageParagraphs(lines: string[]): string[] {
  const text = lines.map((line) => line.trim()).join('\n').trim()
  return text ? text.split(/\n{2,}/).map((paragraph) => paragraph.replace(/\n/g, ' ')) : ['\u00a0']
}

// Show edited passages with an optional view of the surrounding lines.
function ComparisonText({ result }: { result: DiffResult }) {
  const [showContext, setShowContext] = useState(false)
  const blocks = comparisonBlocks(result.changes)

  return (
    <section className="diff-viewer" aria-label="Changes between the two versions">
      <div className="diff-viewer__head">
        <p>{result.from_version} → {result.to_version}</p>
        {blocks.some(({ kind }) => kind === 'context') ? (
          <label className="diff-viewer__toggle">
            <input type="checkbox" checked={showContext} onChange={(event) => setShowContext(event.target.checked)} />
            Show surrounding text
          </label>
        ) : null}
      </div>
      {blocks.length === 0 ? (
        <p className="diff-viewer__empty">The two versions have identical text.</p>
      ) : (
        <div className="diff-viewer__body" role="region" aria-label="Text comparison" tabIndex={0}>
          {blocks.map(({ kind, lines }, index) => {
            if (kind === 'context' && !showContext) return null
            return (
              <div key={index} className={`diff-passage diff-passage--${kind}`}>
                {kind !== 'context' ? (
                  <p className="diff-passage__label">
                    <span className="diff-passage__mark" aria-hidden="true">{kind === 'added' ? '+' : '−'}</span>
                    {kind === 'added' ? 'Added' : 'Removed'}
                  </p>
                ) : null}
                {passageParagraphs(lines).map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="diff-passage__text">{paragraph}</p>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// Show a bill's published versions and the details of a selected comparison.
export function BillDiff({ congress, type, number }: BillDiffProps) {
  const { user } = useSession()
  const { data: versions, loading, error, refetch } = useApi(
    () => listTextVersions(congress, type, number),
    [congress, type, number],
  )

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [comparing, setComparing] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [result, setResult] = useState<DiffResult | null>(null)
  // Counts comparisons so a late answer never replaces a newer one.
  const latestRequest = useRef(0)

  const list: TextVersion[] = versions ?? []
  const options = list.map(({ version_type }) => ({ value: version_type, label: version_type }))

  // Until the reader picks, compare the oldest and newest versions.
  const fromValue = from !== '' ? from : list.length >= 2 ? list[0].version_type : ''
  const toValue = to !== '' ? to : list.length >= 2 ? list[list.length - 1].version_type : ''

  async function compare(event: FormEvent) {
    event.preventDefault()
    if (!fromValue || !toValue || fromValue === toValue) {
      setCompareError('Choose two different versions to compare.')
      return
    }
    const request = ++latestRequest.current
    setComparing(true)
    setSummarizing(false)
    setCompareError(null)
    setResult(null)
    let diff: DiffResult
    try {
      // The public comparison is quick, so show it before any summary is written.
      diff = await diffTextVersions(congress, type, number, fromValue, toValue)
    } catch (cause) {
      if (request === latestRequest.current) {
        setCompareError(cause instanceof Error ? cause.message : 'The comparison could not be made.')
        setComparing(false)
      }
      return
    }
    if (request !== latestRequest.current) return
    setResult(diff)
    setComparing(false)
    if (!user || diff.summary || diff.changes.length === 0) return

    // A signed-in reader can have a missing summary written, which can take a while.
    setSummarizing(true)
    try {
      const token = await getAccountToken(user)
      const { summary } = await diffTextVersions(congress, type, number, fromValue, toValue, token)
      if (request === latestRequest.current && summary) {
        setResult((current) => (current ? { ...current, summary } : current))
      }
    } catch {
      // The summary is optional and the comparison is already on screen.
    } finally {
      if (request === latestRequest.current) setSummarizing(false)
    }
  }

  return (
    <section className="panel" aria-label="Text versions and changes">
      <div className="panel__heading-row">
        <h2>Text versions and changes</h2>
        <span className="panel__count">{list.length > 0 ? `${list.length} ${list.length === 1 ? 'version' : 'versions'}` : ''}</span>
      </div>

      {loading ? (
        <LoadingState message="Loading the published text versions…" />
      ) : error ? (
        <ErrorState title="The text versions could not be loaded" message={error.message} onRetry={refetch} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No published text yet"
          hint="Versions appear here once Congress.gov publishes the bill's text."
        />
      ) : (
        <>
          <ul className="diff-versions" aria-label="Published versions">
            {list.map((version) => (
              <li key={version.version_type} className="diff-versions__item">
                <span className="diff-versions__type">{version.version_type}</span>
                {version.version_date ? <time dateTime={version.version_date}>{formatDate(version.version_date)}</time> : null}
                {version.text_url ? (
                  <a className="diff-versions__link" href={version.text_url} target="_blank" rel="noreferrer">
                    Read text <ExternalLinkIcon size={12} />
                  </a>
                ) : null}
                {version.pdf_url ? (
                  <a className="diff-versions__link" href={version.pdf_url} target="_blank" rel="noreferrer">
                    PDF <ExternalLinkIcon size={12} />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>

          {list.length >= 2 ? (
            <form className="diff-compare" onSubmit={compare}>
              <SelectField id="diff-from" label="From version" value={fromValue} onChange={setFrom} options={options} />
              <SelectField id="diff-to" label="To version" value={toValue} onChange={setTo} options={options} />
              <button type="submit" className="btn btn--primary" disabled={comparing}>
                {comparing ? 'Comparing…' : 'Compare versions'}
              </button>
            </form>
          ) : (
            <p className="muted">One version is published so far; more can be compared once Congress.gov posts them.</p>
          )}

          {compareError ? (
            <p className="form-error" role="alert">
              {compareError}
            </p>
          ) : null}

          {result?.summary ? (
            <div className="diff-summary">
              <div className="explain-part__head">
                <h3>Changes</h3>
                <span className="explain-tag">AI-generated</span>
              </div>
              <p>{result.summary}</p>
            </div>
          ) : summarizing ? (
            <p className="muted" role="status">Summarizing the changes…</p>
          ) : null}

          {result ? <ComparisonText result={result} /> : null}
        </>
      )}
    </section>
  )
}
