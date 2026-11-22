import { useState } from 'react'
import type { FormEvent } from 'react'
import { diffTextVersions, listTextVersions } from '../../api/texts'
import type { BillDiff as DiffResult, TextVersion } from '../../api/texts'
import type { BillType } from '../../api/bills'
import { useApi } from '../../hooks/useApi'
import { formatDate } from '../../lib/format'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'
import { ExternalLinkIcon } from '../icons'

interface BillDiffProps {
  congress: number
  type: BillType
  number: number
}

// Classify one line of the unified diff the backend returns.
function diffClass(line: string): string {
  if (line.startsWith('---') || line.startsWith('+++')) return 'diff-line diff-line__file'
  if (line.startsWith('@@')) return 'diff-line diff-line__hunk'
  if (line.startsWith('+')) return 'diff-line diff-line__add'
  if (line.startsWith('-')) return 'diff-line diff-line__del'
  return 'diff-line'
}

// Show a bill's published versions and the details of a selected comparison.
export function BillDiff({ congress, type, number }: BillDiffProps) {
  const { data: versions, loading, error, refetch } = useApi(
    () => listTextVersions(congress, type, number),
    [congress, type, number],
  )

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [comparing, setComparing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [result, setResult] = useState<DiffResult | null>(null)

  const list: TextVersion[] = versions ?? []

  // Until the reader picks, compare the oldest and newest versions.
  const fromValue = from !== '' ? from : list.length >= 2 ? list[0].version_type : ''
  const toValue = to !== '' ? to : list.length >= 2 ? list[list.length - 1].version_type : ''

  async function compare(event: FormEvent) {
    event.preventDefault()
    if (!fromValue || !toValue || fromValue === toValue) {
      setCompareError('Choose two different versions to compare.')
      return
    }
    setComparing(true)
    setCompareError(null)
    setResult(null)
    try {
      const diff = await diffTextVersions(congress, type, number, fromValue, toValue)
      setResult(diff)
    } catch (cause) {
      setCompareError(cause instanceof Error ? cause.message : 'The comparison could not be made.')
    } finally {
      setComparing(false)
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
              <label className="field">
                <span className="field__label">From version</span>
                <select className="field__control" value={fromValue} onChange={(event) => setFrom(event.target.value)}>
                  {list.map((version) => (
                    <option key={version.version_type} value={version.version_type}>
                      {version.version_type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">To version</span>
                <select className="field__control" value={toValue} onChange={(event) => setTo(event.target.value)}>
                  {list.map((version) => (
                    <option key={version.version_type} value={version.version_type}>
                      {version.version_type}
                    </option>
                  ))}
                </select>
              </label>
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
          ) : null}

          {result ? (
            <div className="diff-viewer">
              <p className="diff-viewer__head">
                {result.from_version} → {result.to_version}
              </p>
              <pre aria-label="Changes between the two versions">
                {result.changes.map((line, index) => (
                  <span key={index} className={diffClass(line)}>
                    {line || ' '}
                    {'\n'}
                  </span>
                ))}
              </pre>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
