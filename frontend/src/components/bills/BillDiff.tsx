import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { diffTextVersions, listTextVersions, readTextVersion } from '../../api/texts'
import type { BillDiff as DiffResult, BillText, TextVersion } from '../../api/texts'
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

const DISPLAY_OPTIONS = [
  { value: 'changes', label: 'Changes' },
  { value: 'context', label: 'Context' },
  { value: 'full', label: 'Full text' },
] as const

type ComparisonDisplay = typeof DISPLAY_OPTIONS[number]['value']

// Show the edited passages with the amount of context the reader chooses.
function ComparisonText({ result, loadFull }: { result: DiffResult; loadFull: () => Promise<DiffResult> }) {
  const [display, setDisplay] = useState<ComparisonDisplay>('changes')
  const [full, setFull] = useState<DiffResult | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [fullError, setFullError] = useState(false)
  const blocks = comparisonBlocks(display === 'full' ? full?.changes ?? [] : result.changes)

  async function choose(mode: ComparisonDisplay) {
    setDisplay(mode)
    if (mode !== 'full' || full || loadingFull) return
    setLoadingFull(true)
    setFullError(false)
    try {
      setFull(await loadFull())
    } catch {
      setFullError(true)
    } finally {
      setLoadingFull(false)
    }
  }

  return (
    <section className="diff-viewer" aria-label="Changes between the two versions">
      <div className="diff-viewer__head">
        <p>{result.from_version} → {result.to_version}</p>
        <div className="page-views" role="group" aria-label="Comparison display">
          {DISPLAY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`btn btn--sm ${value === display ? 'btn--primary' : 'btn--ghost'}`}
              aria-pressed={value === display}
              onClick={() => void choose(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {display === 'full' && loadingFull ? (
        <div className="diff-viewer__empty"><LoadingState message="Loading the full text…" /></div>
      ) : display === 'full' && fullError ? (
        <div className="diff-viewer__empty">
          <ErrorState title="Full text could not be loaded" onRetry={() => void choose('full')} />
        </div>
      ) : blocks.length === 0 ? (
        <p className="diff-viewer__empty">The two versions have identical text.</p>
      ) : (
        <div className="diff-viewer__body" role="region" aria-label="Text comparison" tabIndex={0}>
          {blocks.map(({ kind, lines }, index) => {
            if (kind === 'context' && display === 'changes') return null
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

  const [version, setVersion] = useState('')
  const [compareWith, setCompareWith] = useState('')
  const [opening, setOpening] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)
  const [text, setText] = useState<BillText | null>(null)
  const [result, setResult] = useState<DiffResult | null>(null)
  // Count view requests so a late answer cannot replace a more recent selection.
  const latestRequest = useRef(0)

  const list: TextVersion[] = versions ?? []
  const readable = list.filter((item) => item.downloaded || item.text_url)
  const options = readable.map(({ version_type }) => ({ value: version_type, label: version_type }))
  const newest = readable.findLast((item) => item.version_date) ?? readable.at(-1)
  const versionValue = options.some(({ value }) => value === version) ? version : newest?.version_type ?? ''
  const compareOptions = options.filter(({ value }) => value !== versionValue)
  const compareValue = compareOptions.some(({ value }) => value === compareWith) ? compareWith : ''

  function clearView() {
    latestRequest.current += 1
    setOpening(false)
    setSummarizing(false)
    setViewError(null)
    setText(null)
    setResult(null)
  }

  async function view(event: FormEvent) {
    event.preventDefault()
    if (!versionValue) return
    clearView()
    const request = latestRequest.current
    setOpening(true)

    // Use publication order so additions and removals describe the newer version.
    const pair = compareValue ? options.filter(({ value }) => value === versionValue || value === compareValue) : []
    const [from, to] = pair.map(({ value }) => value)
    let diff: DiffResult
    try {
      if (!from || !to) {
        const content = await readTextVersion(congress, type, number, versionValue)
        if (request === latestRequest.current) {
          setText(content)
          setOpening(false)
        }
        return
      }
      // Open the public comparison before the optional summary request.
      diff = await diffTextVersions(congress, type, number, from, to)
    } catch (cause) {
      if (request === latestRequest.current) {
        setViewError(cause instanceof Error ? cause.message : 'The bill text could not be opened.')
        setOpening(false)
      }
      return
    }
    if (request !== latestRequest.current) return
    setResult(diff)
    setOpening(false)
    if (!user || diff.summary || diff.changes.length === 0) return

    setSummarizing(true)
    try {
      const token = await getAccountToken(user)
      if (request !== latestRequest.current) return
      const { summary } = await diffTextVersions(congress, type, number, from, to, token)
      if (request === latestRequest.current && summary) setResult({ ...diff, summary })
    } catch {
      // The comparison is available while the summary service is unavailable.
    } finally {
      if (request === latestRequest.current) setSummarizing(false)
    }
  }

  return (
    <section className="panel panel--stack" aria-label="Text versions and changes">
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

          {readable.length > 0 && (
            <form className="diff-compare" onSubmit={view}>
              <SelectField
                id="bill-text-version"
                label="Version"
                value={versionValue}
                options={options}
                onChange={(value) => {
                  clearView()
                  setVersion(value)
                  if (compareWith === value) setCompareWith('')
                }}
              />
              {compareOptions.length > 0 && (
                <SelectField
                  id="bill-compare-with"
                  label="Compare with"
                  value={compareValue}
                  options={[{ value: '', label: 'None' }, ...compareOptions]}
                  onChange={(value) => {
                    clearView()
                    setCompareWith(value)
                  }}
                />
              )}
              <button type="submit" className="btn btn--primary" disabled={opening}>View</button>
            </form>
          )}

          {opening && <LoadingState message="Opening bill text…" />}
          {viewError && <p className="form-error" role="alert">{viewError}</p>}

          {text && (
            <section className="diff-viewer" aria-label="Bill text">
              <h3 className="diff-viewer__head">{text.version_type}</h3>
              <div className="diff-viewer__body" role="region" aria-label="Full bill text" tabIndex={0}>
                {passageParagraphs(text.text.split('\n')).map((paragraph, index) => (
                  <p key={index} className="diff-passage__text">{paragraph}</p>
                ))}
              </div>
            </section>
          )}

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

          {result && (
            <ComparisonText
              result={result}
              loadFull={() => diffTextVersions(congress, type, number, result.from_version, result.to_version, undefined, true)}
            />
          )}
        </>
      )}
    </section>
  )
}
